# Gato Tijera — Slides web + Gemelo Digital

Carpeta autónoma (sin build). Abrir en el navegador:

- **`index.html`** → 15 diapositivas web (flechas / Espacio / táctil, botón **Gemelo Digital**). Explican el sistema —sin fases ni entregables— con la estructura de la presentación de referencia: máquina compleja, elementos, analogía, 4 ecuaciones, Simulink, 2 resultados y cierre.
- **`gemelo.html`** → gemelo digital: gato rojo de kit + auto que se levanta de un solo lado (Three.js), 4 gráficas con cursor sincronizado, lecturas en vivo, 6 sliders, carga de CSV de Simulink y exportación CSV.

## Gemelo: qué incluye

| Elemento | Detalle |
|---|---|
| 3D sincronizado | Gato rojo con calcomanía 1.5 T, tornillo con rosca, manivela que gira, tornillería hexagonal; pivota el auto sobre las ruedas izquierdas (balanceo 0° → ~15.7°, calculado exacto) |
| Gráficas | `h`, `ω`, `T`, `τᵤ/τc` con cursor vertical ligado al 3D y overlay ocre del CSV |
| Lecturas en vivo | t, τᵤ, φ, ω, θ, h, v, T, τc, vueltas, balanceo |
| Sliders sin reiniciar | M, L, b, τ₀, p, μ → trayectoria recalculada al instante (6001 pasos) |
| Contraste | Subir CSV / “Usar CSV incluido” → RMSE por canal (h ≈ 3e-5 m, ω ≈ 0.002 rad/s) |

## Física (réplica del `.slx`)

`J·dω/dt = τᵤ − b·ω − Tc(θ)`, `Tc = c·W/tanθ`, `cosθ = cosθ₀ − Kc·φ`,
`h = 2L·sinθ`, `v = (p/2π)·ω/tanθ`, `T = W/tanθ`.
Rigidez `λ = −b/J ≈ −6666 s⁻¹` (0.15 ms vs 40 s) → Simulink usa `ode15s`;
el gemelo usa **Euler implícito** a 0.01 s (estable, mismas curvas).

## Archivos

```text
Gato_Tijera/
  index.html  gemelo.html
  css/slides.css  css/gemelo.css
  js/physics.js  js/slides.js  js/gemelo.js
  data/datos_mecanismo.csv   (copia del CSV de Simulink)
  data/datos_python.csv      (réplica generada sin MATLAB)
  python/generar_csv.py      (regenera el CSV: python generar_csv.py)
  .agents/skills/            (skills del proyecto: impeccable + emilkowalski)
  skills-lock.json
```

## Exposición (15 min)

1. `index.html` → explicar el sistema (slides 1–11) y resultados (12–14).
2. **Gemelo Digital** → play, mover el tiempo (cursor barre las curvas con el 3D).
3. Bajar τ₀ a 15 → no arranca (resistencia 18.9 N·m). Variar M 200↔600 kg.
4. “Usar CSV incluido” → RMSE ≈ 0 → coincidencia total con Simulink.

> Nota: el 3D usa Three.js por CDN; sin internet aparece un aviso pero gráficas, sliders y CSV siguen funcionando. Para exponer sin depender de red, abrir una vez con internet (queda en caché) o servir con `python -m http.server`.
