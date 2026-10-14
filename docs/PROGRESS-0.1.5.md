# Dailoop 0.1.5 — estado de ejecución

Plan: [PLAN-0.1.5.md](PLAN-0.1.5.md). Fecha de preparación: 2026-10-13, America/Bogota.

**Estado actual: entrega local C6 para prueba física.** C3 fue retirada por un modal de edición invisible al 200 %. C6 mantiene el contenido visible desde el primer render y anima posición/escala después de `Modal.onShow`; QA verificó Categoría/cursor sobre el teclado y continuar/descartar. ARM64, comparador y x86 pasan 63/63 inspecciones; nueve controles automatizados y 19 pruebas Web finales pasan. La regresión funcional nativa de archivos, restauración, reportes, primer inicio offline y guardas está cerrada, con fallos de automatización separados. Los objetivos completos de fluidez/S26 siguen abiertos; no se certifican 120 Hz.

Modelo recomendado: GPT-6.1 Sol, razonamiento High. El plan no cambia el modelo automáticamente.

Alcance: PF-01 fluidez, PF-02 teclado, PF-03 columnas, PF-04 movimiento, PF-05 peso. PF-06 sincronización, PF-07 Google y PF-08 Flutter aplazados.

Actualización posterior: el usuario encargó a Gemini Argo una implementación Flutter independiente en `../Dailoop-Flutter`. Esta ejecución sigue siendo React Native. El proyecto Flutter tiene su propio handoff, snapshot, archivos y datos; no se integra como migración ni se compara cambiando el stack de esta rama.

| Checkpoint | Estado | Evidencia |
| --- | --- | --- |
| CP0 — Baseline y reproducción | BASELINE REGISTRADO | Teclado FAIL reproducido en vc2; métricas del AVD 60 Hz guardadas por QA. S26/120 Hz no medido. |
| CP1 — Teclado y fluidez | MEJORA MEDIDA / OBJETIVO DE FLUIDEZ ABIERTO | Scroll C3 p95=44 ms frente a 133, jank moderno 20,24 % frente a 96,49 %; no cumple el objetivo del 95 % dentro del presupuesto. C6 conserva Inicio/Estadísticas/materiales de C3; no se midió Gfx del APK C6 exacto. Teclado funcional observado en las variantes detalladas por QA. Latencia toque→contenido y 120 Hz físicos pendientes. |
| CP2 — Preferencias y cuadrícula | WEB Y NATIVO PASS / TALKBACK FÍSICO PENDIENTE | Cuatro densidades, SQLite tras reapertura, identidad exacta y un solo append nativo verificados. Primera fila con cuatro controles, mínimo 78,3×48 dp. Texto al 200 % adapta cuatro a dos conservando la selección. Preferencia cuatro conservada en C6. |
| CP3 — Animaciones | CORRECCIÓN C6 PASS FUNCIONAL | `native-c6-modal-regression.json`: entrada visible, Categoría/cursor [125,1660][1219,1850] frente a teclado desde y=1984; continuar y descartar conservan 11 registros en detalle. Inspección ADB independiente; YAML07 conserva FAIL de búsqueda/estabilidad. Unit de visibilidad antes de onShow PASS. |
| CP4 — Versionado / builds / peso | C6 PASS | Tres variantes 63/63, bundle idéntico y 73 inputs intactos. ARM64 35.751.234 B, reducción 46,80 %, debajo de 40 MB. Mismo paquete/firma, 0.1.5/vc3. |
| CP5 — Regresión y entrega | CIERRE LOCAL CON LÍMITES / FÍSICO PENDIENTE | Nueve controles, 15 tests Jest y 19 Web finales PASS. C6 conserva exactamente 102 registros tras descartar/cancelar/rechazar; restaura los 101 históricos y conserva preferencia cuatro. Markdown SAF exacto, compartir/cancelar y primer inicio offline del APK exacto comprobados. Guardas sin controles de QA. Root revalida cinco comparaciones de backups. Los FAIL de automatización y límites físicos permanecen en QA. |

## Fuente y artefactos vigentes

**C6 congelada:** 73 inputs, SHA `9aa8e141613d47bb417cda237773129db984e8d67c4a3e9bbbd5d99379ec6861`, `runtime-inputs.json`/`runtime-inputs-candidate6.json`. Solo cambian `src/ui/motion.tsx` y `components.tsx` frente a C3. Se verificaron de nuevo los 73 hashes después de registrar el fix en Git.

- APK ARM64: `output/releases/v0.1.5/Dailoop-0.1.5-arm64.apk`, 35.751.234 B, SHA-256 `94ffe4ff7c6a11376c84a2e5b01de8d01cc74e956af4ed9d0dd7a75938d92c29`.
- Variante QA: `output/android-build/v0.1.5/x86_64-optimized-6/Dailoop-0.1.5-x86_64.apk`, 36.229.077 B, SHA-256 `addf248f6b5dd592ca648627bd680b1689a6dbf1637d878c513091b1604816fd`.
- Comparador ARM64 sin optimización: 44.596.671 B, SHA-256 `2715d0497900a1691cfdd147b456726ae19d4c7b79d115e53287e15d8e12f1ce`. R8/reducción de recursos ahorran 8.845.437 B con el mismo código/ABI.
- Bundle Hermes común a las tres variantes C6: `a774a652d473a3123666e5b1be83f2ff7a1aed273cf63f7b5da0ee7516d99778`. Copia extraída en `shipping-bundle-c6`; mapas R8 en `r8-shipping6`.
- Preview producción: `http://localhost:8795/`, export entry `entry-89ecc71d22c83894ee561d58ddb28484.js`. Pruebas en contextos aislados, sin tocar datos del usuario. Dev natural se sirvió en 8793; `__DEV__`/aislamiento comprobados y seis contratos PASS. Ese servidor temporal se cerró al terminar.
- Inspecciones vigentes: `apk-arm64-optimized-6`, `apk-x86-optimized-6`, `apk-arm64-baseline-6`, 63/63 cada una. Control negativo C6 falla solo por ABI. Directorios de otras candidatas son históricos.
- Dependencias fijadas conservadas; Expo Doctor 21/21 PASS. APK 0.1.0, originales y certificado sin cambios. Sin push/release GitHub, servicios externos ni cambios en Flutter.
- Durante la prueba de teclas reales, otra app tomó el primer plano de `emulator-5580`. QA detuvo los toques; ese intento queda INVALIDADO. No se cierra ni se manipula la app ajena. El cierre usa el AVD nuevo exclusivo `Dailoop015_Final_API37`/`emulator-5590`, sin clonar userdata en uso. La evidencia anterior y sus límites se conservan.
- Commits de producto locales: `b791d33` (interfaz), `4416213` (build/verificación), `3c2baf3` (visibilidad inicial de formularios). El commit de cierre añade tests/documentación; el HEAD exacto está en `output/releases/v0.1.5/release-manifest.json`. No hay push.
- Evidencia nativa C6: `native-c6-modal-regression.json`, `native-c6-cancel-corrupt-exact-comparison.json`, `native-c6-historical-exact-comparison.json`, `native-c6-report-exact-comparison.json`, `native-c6-fresh-regression.json` y `native-c6-private-routes-assessment.json`, bajo `output/verification/v0.1.5/qa/`. Revisión directa root: `root-native-data-validation.json`, cinco comparaciones PASS.
- Procesos propios al cerrar: preview 8795 activa (PID 49288); dev 8793 apagado; `Dailoop015_Final_API37`/5590 apagado por QA tras identificarlo. 5580 pertenece al control externo observado y se deja intacto. No quedan builds ni Metro de Dailoop en curso.

## Contexto conservado de la planificación

- HEAD conocido: `f236b266b1ea625d324f52ae64972a1a35dacec5`, branch main, repo público `iAdamn/Dailoop`, tag v1.0. Verificar antes de editar.
- Hay documentación de auditoría y del presente handoff modificada/no registrada. Conservarla.
- Análisis ZIP previo disponible en `output/verification/requirements-audit/apk-size-baseline.json`. No es un build ni una medición de rendimiento 0.1.5.
- El emulador de la entrega anterior se dejó apagado. Una preview puede seguir abierta; identificar procesos/puertos antes de actuar. No detener procesos de otros proyectos ni borrar datos personales de preview.
- No se ha cambiado código, versión, lockfile, SDK, firma ni binario para 0.1.5 durante la planificación. No hay pruebas nuevas de producto ni commits/push de este plan.

## Próximo paso

Probar la candidata ARM64 en el S26 Ultra / Android 17 siguiendo [RELEASE-0.1.5.md](RELEASE-0.1.5.md): backup primero, actualizar sin desinstalar, teclado habitual, densidades, TalkBack y mediciones de respuesta/cuadros a frecuencia efectiva. La latencia toque→contenido, el objetivo del 95 % dentro del presupuesto y 120 Hz siguen abiertos. No reconstruir ni repetir suites completas sin un nuevo defecto o cambio de fuente. No publicar en GitHub ni instalar en el teléfono desde un agente sin una instrucción específica para esa acción.

## Plantilla para cada cierre o interrupción

- Fase/checkpoint activo:
- Archivos modificados y dueño:
- Resultado y evidencia (ruta, comando, entorno, hash si aplica):
- Fallos o criterios pendientes:
- Procesos propios activos (puerto/serial/ruta):
- Siguiente acción concreta:

## Historial de decisiones y experimentos

Las cifras/hashes de candidatas anteriores en este historial explican los experimentos; prevalecen los artefactos vigentes de arriba. Los pasos «pendientes» describen su momento cronológico y no sustituyen la matriz actual.

- Android usa SQLite dedicado para preferencias. Web usa localStorage únicamente para preferencias de presentación, sin datos personales ni nueva dependencia, para evitar competir por OPFS con la base auditable y compartir densidad entre pestañas de solo lectura. Backup v1 y MIGRATION_1 intactos.
- La prueba Jest usa un adaptador síncrono de motion sin JSI: prueba contratos de controles, no FPS ni animaciones nativas. La validación real será Web/Android.
- Native backdrop: tres texturas de paleta precalculadas sustituyen 180 vistas; seis assets suman 425.193 bytes antes del empaquetado. Comparación visual/nativa pendiente.
- QA conserva fixture exacto antes de upgrade (10 actividades/101 registros), incluido un tap accidental documentado. No borrar esa base antes de la candidata.
- Metro excluye `output`, `dist`, `android` e `ios` del proyecto propio: SDK/cache/logs no deben provocar vigilancia/rebundling. Dev 8793/8794 reiniciado; los timeouts iniciales conservados no se atribuyen sin más a SQLite.
- Export Web final después del guard busy: `entry-e283625989171412fae3fc23a099bd5a.js`, servido en 8795. Archivos intermedios, logs e inspecciones en `output/verification/v0.1.5/` y `output/android-build/v0.1.5/`.
- Fuente de producción congelada: 73 archivos, SHA-256 `b5bcb40ff8c2a68b0e1d4b2bc6babb7b1dfb4ee50826b75d64b809b255089651`, en `runtime-inputs.json`. Bundle Hermes final `015f02d798304d2f4d0ac694051f8605814eeb48b555c7e18d875ba518ed3e95` en tres variantes comparables.
- ARM64 final `output/releases/v0.1.5/Dailoop-0.1.5-arm64.apk`, SHA-256 `3385d511d240dc7de519e0d517994c6b2f5f2b9ea9343ebd4c042f8538c3ba79`; compilaciones pesadas terminadas. QA tiene el AVD en exclusiva. No lanzar build/test pesado durante Gfx.
- Próximo cierre: inspeccionar evidencia de actualización, teclado y Gfx de QA; completar guía/manifiesto y huella completa final. Mantener pendientes físicos S26/120 Hz y no publicar en GitHub.
- Reapertura CP1 por evidencia: candidata2 no resuelve scroll (201 frames, p50/p95/p99 97/121/129 ms). No declarar PF-01 PASS por la caída del porcentaje janky de navegación: la animación añade frames. Se conserva la candidata2 y su fuente congelada para comparar un cambio aislado de blur en tarjetas. Hasta completar el experimento, el APK en releases es una candidata previa, no una entrega aprobada.
- Experimento3: solo `material.tsx` cambia frente a2. Quita captura BlurView regular Android y conserva opacidad/tinte Expo mediante composición equivalente. Scroll activo27/44/85 ms y20,24%janky; reducido27/34/40 ms y19,88%. Mejora material frente2; captura Home inspeccionada por root/QA, sin pérdida visible del aspecto. Sin ANR. Fuente SHA `0b660cc11b6ee1ec64efb8199022a9361711aef69a2eed34235de9bdeeb0c4da`.
- Experimento4 en build: extiende el mismo tratamiento a strong (intensidad equivalente65; regular42), sin cambiar otras capas ni dominio. AVD apagado hasta build/verify; después comparar mismo10/101/col1. Mantener distinción entre GfxInfo/janky moderno/legacy, cola de pipeline y frecuencia presentada; DisplayPresentTime=0 en este emulador impide certificar120Hz.
- Resultado4 normal verificado: scroll414frames,26,81%janky,p50/p95/p99 32/48/73 ms; nav758frames,9,37%,p95 53 ms. No acredita mejora consistente frente3. Se revierte strong al comportamiento3; la primera pasada4 etiquetada activa era ambigua por persistencia de escala del emulador y se conserva como tal.
- Experimento5 preparado: sobre material3, caché de textura GPU del item durante drag/momentum únicamente, liberación al final/150 ms, techo5 s y limpieza background/unmount. Sin build aún; QA revisa teclado200%/horizontal antes de congelar. Vigilar clipping de sombras, memoria temporal y comparar con3, no aceptar sin evidencia. `npm run verify` de4 cerró9/9 PASS; archivos anteriores preservados.
- Decisión final de fuente: **candidata3**, sin caché experimental. C5 compiló/pasó63inspecciones y9checks, pero no llegó a instalarse: el AVD se atascó en zygote antes de cargar APK; apareció carga concurrente real de CPU/GPU del host. Se conserva C5 como INCONCLUSO y se revierte su código. Revalidación de los73inputs confirma SHA exacta3 `0b660cc11b6ee1ec64efb8199022a9361711aef69a2eed34235de9bdeeb0c4da`. No se detienen procesos ajenos.
- Teclado200%/horizontal: Categoría y nota larga muestran texto/caret en editor extraído de Gboard. Borradores descartados,10/101/col1 intactos. Es evidencia de ese IME, no del formulario original sobre él ni Samsung Keyboard físico.
- ARM64 comparador/final3 en build; export Web3 listo (`entry-679f2581d061735cd745578115c6f8a6.js`). AVD apagado para builds. Se prepara export de desarrollo admitido por Expo para cerrar SQLite Web sin depender del bundling HTTP lento; conservar timeouts/tests originales.
- Reapertura por regresión de modal: C3 mostró solo el fondo al editar con texto al 200 %. El contenido tenía medidas positivas, pero no era visible. La causa precisa sigue como hipótesis; C6 separa opacidad (visible desde el inicio) de escala/posición e inicia la entrada en `Modal.onShow`. Unit y observación Android C6 verifican visibilidad, cursor sobre Gboard y conservar/descartar. C3 queda retirada para entrega.
- Fuente final C6: 73 inputs SHA `9aa8e141613d47bb417cda237773129db984e8d67c4a3e9bbbd5d99379ec6861`; tres APK inspeccionados 63/63 con bundle común `a774a652d473a3123666e5b1be83f2ff7a1aed273cf63f7b5da0ee7516d99778`. ARM64 35.751.234 B, reducción 46,80 %. No se vuelve a medir rendimiento con el AVD software ni se atribuyen a C6 exacta los números C3.
- Cierre C6 en AVD exclusivo 5590: después de un bloqueo de System UI se recuperó con Wait; el fallo original permanece. Cancelar/rechazar backups conserva exactamente 102 registros y su historial. La restauración histórica devuelve exactamente 101 y mantiene cuatro columnas. Markdown SAF exacto y compartir/cancelar comprobados. Root revalida cinco comparaciones de archivos reales.
- Primer inicio C6 exacta offline después de conservar el backup ficticio: PASS funcional, no medición de latencia. Rutas internas sin controles QA, con limitación visual del texto junto al sistema. 5590 apagado; 5580 intacto bajo control externo; preview 8795 conservada. Pruebas físicas, TalkBack, latencia y objetivo completo de fluidez pendientes.
