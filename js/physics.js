/* ============================================================
   Gato Tijera — Núcleo físico compartido (Fase I + II)
   Réplica fiel de simular_gato_tijera.m / gato_tijera.slx
   Dinámica sobre el eje del tornillo:
     J·dω/dt = Tau − b·ω − Tc(θ),  Tc = c·W / tan θ
   Cinemática del rombo:
     cos θ = cos θ0 − Kc·φ ; h = 2L·sin θ ; v = Kv·ω/tan θ ; T = W/tan θ
   Integración: Euler implícito en ω (estable frente a la rigidez
   λ = −b/J ≈ −6666 s⁻¹, equivalente funcional a ode15s con dt=0.01s)
   ============================================================ */
'use strict';

const GatoPhysics = (() => {
  const DEFAULTS = {
    L: 0.20,        // lado barra [m]
    M: 400,         // carga [kg]
    g: 9.81,
    p: 0.003,       // paso tornillo [m]
    dm: 0.0105,     // diámetro medio [m]
    mu: 0.15,
    alphaDeg: 15,   // semiángulo filete
    J: 3e-4,        // inercia eje [kg·m²]
    b: 2.0,         // amortiguamiento [N·m·s/rad]
    Lb: 0.30,       // brazo manivela [m]
    th0deg: 15,
    th1deg: 65,
    Tau0: 22,       // torque [N·m]
    Tstep: 1,       // inicio pulso [s]
    Ton: 40,        // duración [s]
    Tfin: 60,
    dt: 0.01
  };

  function derived(P) {
    const W = P.M * P.g;
    const mup = P.mu / Math.cos(P.alphaDeg * Math.PI / 180);
    const c = P.p / (2 * Math.PI) + mup * P.dm / 2;
    const Kc = P.p / (4 * Math.PI * P.L);
    const Kh = 2 * P.L;
    const Kv = P.p / (2 * Math.PI);
    const th0 = P.th0deg * Math.PI / 180;
    const th1 = P.th1deg * Math.PI / 180;
    const phi_max = (Math.cos(th0) - Math.cos(th1)) / Kc;
    const lambda = -P.b / P.J;
    const tauMech = P.J / P.b;
    return { W, mup, c, Kc, Kh, Kv, th0, th1, phi_max, lambda, tauMech };
  }

  function thetaFromPhi(phi, D) {
    let x = Math.cos(D.th0) - D.Kc * phi;
    x = Math.min(1, Math.max(-1, x));
    // clamp al rango físico [th0, th1]
    let th = Math.acos(x);
    th = Math.min(D.th1, Math.max(D.th0, th));
    return th;
  }

  function tauPulse(t, P) {
    // Valor del bloque Pulse Generator justo DESPUÉS de t (el que registra el Mux):
    // 22 N·m en [Tstep, Tstep+Ton), 0 fuera. Coincide con datos_mecanismo.csv
    // (tau=22 en t=1.00, tau=0 en t=41.00).
    return (t >= P.Tstep && t < P.Tstep + P.Ton) ? P.Tau0 : 0;
  }

  // Un paso de integración (Euler implícito en ω → incondicionalmente estable)
  function step(st, Tau, dt, P, D) {
    const th = thetaFromPhi(st.phi, D);
    const tan = Math.tan(th);
    const T = D.W / tan;
    const Tc = D.c * T;
    // ω_{n+1} = (ω_n + dt/J·(Tau − Tc)) / (1 + dt·b/J)
    let w = (st.w + (dt / P.J) * (Tau - Tc)) / (1 + (dt * P.b) / P.J);
    if (w < 0) w = 0; // autobloqueo: no retrocede solo
    let phi = st.phi + w * dt;
    if (phi < 0) { phi = 0; w = 0; }
    if (phi > D.phi_max) { phi = D.phi_max; w = 0; }
    const th2 = thetaFromPhi(phi, D);
    const tan2 = Math.tan(th2);
    const h = D.Kh * Math.sin(th2);
    const v = D.Kv * w / tan2;
    const T2 = D.W / tan2;
    const Tc2 = D.c * T2;
    return { phi, w, theta: th2, h, v, T: T2, Tc: Tc2, Tau };
  }

  // Simula la subida completa. Devuelve objeto con Float64Array por canal.
  function simulate(Pin, opts = {}) {
    const P = Object.assign({}, DEFAULTS, Pin);
    const D = derived(P);
    const dt = opts.dt || P.dt;
    const Tfin = opts.Tfin || P.Tfin;
    const n = Math.floor(Tfin / dt) + 1;
    const out = {
      t: new Float64Array(n), tau: new Float64Array(n),
      phi: new Float64Array(n), w: new Float64Array(n),
      theta: new Float64Array(n), h: new Float64Array(n),
      v: new Float64Array(n), T: new Float64Array(n), Tc: new Float64Array(n),
      P, D, dt
    };
    let st = { phi: 0, w: 0 };
    const thInit = thetaFromPhi(0, D);
    // Índices de conmutación exactos (evita errores de coma flotante en t=i*dt):
    const kOn = Math.round(P.Tstep / dt), kOff = Math.round((P.Tstep + P.Ton) / dt);
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      const TauRec = (i >= kOn && i < kOff) ? P.Tau0 : 0;          // lo que registra el Mux
      const TauApply = (i - 1 >= kOn && i <= kOff) ? P.Tau0 : 0;   // lo que actuó en (t-dt, t]:
                                                                  // la muestra del flanco refleja la dinámica previa
      if (i === 0) {
        const tan = Math.tan(thInit);
        out.t[i] = 0; out.tau[i] = TauRec;
        out.phi[i] = 0; out.w[i] = 0; out.theta[i] = thInit;
        out.h[i] = D.Kh * Math.sin(thInit);
        out.v[i] = 0; out.T[i] = D.W / tan; out.Tc[i] = D.c * out.T[i];
      } else {
        const s = step(st, TauApply, dt, P, D);
        st = { phi: s.phi, w: s.w };
        out.t[i] = t; out.tau[i] = TauRec;
        out.phi[i] = s.phi; out.w[i] = s.w; out.theta[i] = s.theta;
        out.h[i] = s.h; out.v[i] = s.v; out.T[i] = s.T; out.Tc[i] = s.Tc;
      }
    }
    return out;
  }

  // Estado instantáneo para un tiempo t (interpolación lineal sobre la sim)
  function sampleAt(sim, t) {
    const n = sim.t.length;
    const i = Math.max(0, Math.min(n - 2, Math.floor(t / sim.dt)));
    const f = Math.max(0, Math.min(1, (t - sim.t[i]) / sim.dt));
    const L = (a) => a[i] * (1 - f) + a[i + 1] * f;
    return {
      t, tau: L(sim.tau), phi: L(sim.phi), w: L(sim.w),
      theta: L(sim.theta), h: L(sim.h), v: L(sim.v), T: L(sim.T), Tc: L(sim.Tc)
    };
  }

  // RMSE entre dos series (para validación vs CSV de Simulink)
  function rmse(a, b) {
    const n = Math.min(a.length, b.length);
    let s = 0;
    for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s / n);
  }

  return { DEFAULTS, derived, thetaFromPhi, tauPulse, step, simulate, sampleAt, rmse };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GatoPhysics;
if (typeof window !== 'undefined') window.GatoPhysics = GatoPhysics;
