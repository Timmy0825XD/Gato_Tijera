"""
Gato Tijera — réplica en Python de simular_gato_tijera.m (Fases I y II).
Integra J·dw/dt = Tau − b·w − Tc(θ) con método implícito (estable ante
rigidez λ = −b/J ≈ −6666 s⁻¹, equivalente a ode15s del .slx) y exporta
datos_mecanismo.csv con el mismo formato/encabezados.

Uso:
    python generar_csv.py [--Tau0 22] [--M 400] [--L 0.20] [--out ../data/datos_mecanismo.csv]
Requiere solo la librería estándar (sin scipy).
"""
import argparse, csv, math

def simulate(L=0.20, M=400.0, g=9.81, p=0.003, dm=0.0105, mu=0.15,
             alpha_deg=15.0, J=3e-4, b=2.0, Tau0=22.0, Tstep=1.0,
             Ton=40.0, Tfin=60.0, dt=0.01, th0_deg=15.0, th1_deg=65.0):
    W = M * g
    mup = mu / math.cos(math.radians(alpha_deg))
    c = p / (2 * math.pi) + mup * dm / 2
    Kc = p / (4 * math.pi * L)
    Kh, Kv = 2 * L, p / (2 * math.pi)
    th0, th1 = math.radians(th0_deg), math.radians(th1_deg)
    phi_max = (math.cos(th0) - math.cos(th1)) / Kc

    def theta(phi):
        x = min(1.0, max(-1.0, math.cos(th0) - Kc * phi))
        return min(th1, max(th0, math.acos(x)))

    rows = []
    phi, w = 0.0, 0.0
    n = int(round(Tfin / dt)) + 1
    k_on, k_off = int(round(Tstep / dt)), int(round((Tstep + Ton) / dt))
    for i in range(n):
        t = i * dt
        tau_rec = Tau0 if (k_on <= i < k_off) else 0.0   # registrado (Mux)
        Tau = Tau0 if (k_on <= i - 1 and i <= k_off) else 0.0  # actuó en (t-dt,t]
        if i > 0:
            th = theta(phi)
            Tc = c * (W / math.tan(th))
            w = (w + (dt / J) * (Tau - Tc)) / (1 + (dt * b) / J)  # Euler implícito
            if w < 0: w = 0.0                                     # autobloqueo
            phi = min(phi_max, max(0.0, phi + w * dt))
            if phi in (0.0, phi_max) and Tau <= Tc: w = 0.0
        th = theta(phi)
        h = Kh * math.sin(th)
        T = W / math.tan(th)
        rows.append((t, tau_rec, phi, w, th, h, Kv * w / math.tan(th), T, c * T))
    meta = dict(W=W, c=c, Kc=Kc, phi_max=phi_max, lam=-b / J)
    return rows, meta

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--Tau0', type=float, default=22.0)
    ap.add_argument('--M', type=float, default=400.0)
    ap.add_argument('--L', type=float, default=0.20)
    ap.add_argument('--b', type=float, default=2.0)
    ap.add_argument('--out', default='../data/datos_mecanismo.csv')
    a = ap.parse_args()
    rows, meta = simulate(Tau0=a.Tau0, M=a.M, L=a.L, b=a.b)
    with open(a.out, 'w', newline='') as f:
        w_ = csv.writer(f)
        w_.writerow(['t [s]', 'tau_u [N*m]', 'phi [rad]', 'omega [rad/s]',
                     'theta [rad]', 'h [m]', 'v [m/s]', 'T [N]', 'tau_c [N*m]'])
        for r in rows:
            w_.writerow([f'{x:.6f}' for x in r])
    print(f"OK: {len(rows)} filas -> {a.out}")
    print(f"W={meta['W']:.1f} N  c={meta['c']*1000:.3f} mm  "
          f"phi_max={meta['phi_max']:.1f} rad ({meta['phi_max']/(2*math.pi):.1f} vueltas)  "
          f"lambda={meta['lam']:.0f} 1/s")
    print(f"h: {rows[0][5]:.4f} -> {rows[-1][5]:.4f} m | "
          f"wmax={max(r[3] for r in rows):.2f} rad/s")

if __name__ == '__main__':
    main()
