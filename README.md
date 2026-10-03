# Gato Tijera — Fase III · Slides web + Gemelo Digital

Carpeta autónoma (sin build). Abrir en el navegador:

- **`index.html`** → diapositivas web (10 slides, ← → / Espacio, botón **🧬 Gemelo Digital**).
- **`gemelo.html`** → gemelo digital sincronizado: 3D (Three.js) + 4 gráficas con cursor + lecturas en vivo + 6 sliders + carga de CSV de Simulink + exportación CSV.

## Cumplimiento de la guía (Fase III)

| Requisito | Dónde |
|---|---|
| Mecanismo + gráfica sincronizada con cursor vertical | `gemelo.html`: viewport 3D + 4 canvas, mismo `tPlay` |
| Lectura de variables en vivo | Panel 📡 (t, τᵤ, φ, ω, θ, h, v, T, τc, vueltas) |
| Sliders sin reiniciar | M, L, b, τ₀, p, μ → `resim()` instantánea (6001 pasos) |
| Contraste vs `datos_mecanismo.csv` + Scope | Subir CSV / “Usar CSV incluido” → overlay ocre + tabla RMSE |

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
  python/generar_csv.py      (regenera el CSV sin MATLAB: python generar_csv.py)
```

## Exposición (15 min)

1. `index.html` → presentar Fases I–II (slides 1–7).
2. **Gemelo Digital** → play, mover `scrub` (cursor barre las curvas con el 3D).
3. Bajar τ₀ a 15 → no arranca (resistencia 18.9 N·m). Variar M 200↔600 kg.
4. “Usar CSV incluido” → RMSE ≈ 0 → coincidencia total con Simulink.

> Nota: el 3D usa Three.js por CDN; sin internet el aviso aparece pero gráficas, sliders y CSV siguen funcionando. Para exponer sin depender de red, abrir una vez con internet (queda en caché) o servir con `python -m http.server`.
