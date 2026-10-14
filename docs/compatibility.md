# Matriz de compatibilidad — fase 0

Fecha de consulta: 12 de octubre de 2026, America/Bogota. Investigación por el subagente de dependencias; integración y lockfile a cargo del coordinador. Las tablas conservan las candidatas de investigación y sus diferencias se resuelven explícitamente abajo. La combinación final está instalada y verificada; no se generó APK.

## Decisión

Usar Expo SDK 57, estable según el changelog y la matriz oficial, con `expo@57.0.28`. SDK 58 aparece como beta en el changelog y como `next` en npm; no adoptarlo por su numeración. El baseline SDK 57 del handoff es correcto; los parches se actualizan a los observados. El paquete `expo-template-blank-typescript@57.0.30` da una base mínima; el template default añade bibliotecas opcionales que Dailoop no necesita automáticamente.

Node local comprobado con `node --version`: **v24.15.0**. Cumple los engines de RN, RNTL, Jest y Playwright elegidos. Node 24 está en LTS según Node.js. No se cambia la instalación global del usuario.

## Confirmación durante integración

Después de esta investigación, el coordinador instaló el conjunto exacto y el validador remoto `expo install --check` requirió `react-native-web@0.21.2` y `@types/react@19.2.4`, por encima del manifest estático inicial. QA comprobó esas versiones mediante `npm ls`. La resolución de peers opcionales de Router añadió Reanimated/Worklets; se fijaron explícitamente `react-native-reanimated@4.5.1` y `react-native-worklets@0.10.1` según el conjunto Expo, evitando Worklets 0.13 incompatible con `expo-modules-core@57.0.22`. El coordinador reportó Expo Doctor 21/21 PASS. Ver `qa-plan.md` para los resultados ejecutados y sus límites.

## Runtime base y navegación

| Paquete | Versión candidata exacta | Evidencia / compatibilidad |
|---|---|---|
| expo | 57.0.28 | npm latest y sdk-57; template 57.0.30 |
| react | 19.2.3 | Matriz y template SDK 57 |
| react-dom | 19.2.3 | Igual a React; matriz SDK 57 |
| react-native | 0.86.3 | Matriz empaquetada SDK 57; peer React ^19.2.3 |
| react-native-web | 0.21.0 | Matriz SDK 57; peers React/DOM ^18 o ^19 |
| expo-router | 57.0.26 | Matriz empaquetada y template SDK 57 |
| @expo/metro-runtime | 57.0.16 | Matriz SDK 57; requerido por Router ^57.0.16 |
| expo-linking | 57.0.12 | Requerido por Router ^57.0.12 |
| expo-constants | 57.0.21 | Requerido por Router ^57.0.21 |
| react-native-screens | 4.26.0 | Matriz SDK 57; peer RN >=0.84 |
| react-native-safe-area-context | 5.7.0 | Matriz SDK 57; Router exige >=5.4 |
| expo-sqlite | 57.0.4 | Matriz SDK 57; peers Expo/React/RN sin restricción adicional |
| expo-status-bar | 57.0.1 | Template mínimo y matriz SDK 57 |
| expo-splash-screen | 57.0.10 | Matriz SDK 57; recursos nativos por validar tras gate APK |
| expo-system-ui | 57.0.4 | Matriz SDK 57 |

`@expo/log-box@^57.0.4` es peer requerido de Router y Metro runtime; `expo@57.0.28` ya lo declara como dependencia. Revisar el árbol resuelto. Router marca reanimated, gesture-handler, react-server-dom-webpack y RNTL como peers opcionales. No añadir reanimated/worklets/gesture-handler sin necesidad funcional. No añadir react-server-dom-webpack para esta preview estática.

RN 0.86.3 declara Node `^20.19.4 || ^22.13.0 || ^24.3.0 || >=25.0.0`; Expo documenta mínimo Node 22.13.x y RNTL exige `^22.13.0 || >=24`. Se conserva Node 24.15.0. RN trae `hermes-compiler@250829098.0.17`; no instalar Hermes separadamente.

## Archivos, identidad y dominio

| Paquete | Versión candidata exacta | Evidencia / estado |
|---|---|---|
| expo-file-system | 57.0.7 | npm y matriz SDK 57; API de archivos nativa por probar |
| expo-sharing | 57.0.23 | npm y matriz SDK 57; cambia desde 57.0.22 del handoff |
| expo-document-picker | 57.0.3 | npm y matriz SDK 57 |
| expo-crypto | 57.0.4 | npm y matriz SDK 57; UUID/digest por smoke test |
| expo-localization | 57.0.2 | npm y matriz SDK 57; zona explícita guardada en dominio |
| expo-clipboard | 57.0.2 | npm y matriz SDK 57; acción explícita, sin lectura automática |
| expo-linear-gradient | 57.0.2 | npm y matriz SDK 57; solo degradados aprobados |
| date-fns | 4.4.0 | npm estable observado; sin peers declarados |
| @date-fns/tz | 1.4.1 | Pin conservador del handoff, existente en npm y documentado en changelog |
| zod | 4.6.7 | npm estable observado; parche posterior al 4.6.6 del handoff |

Los paquetes de esta tabla declaran licencia MIT. `@date-fns/tz@1.5.0` también existe y es latest en npm, pero el changelog primario consultado termina en 1.4.1. Mantener 1.4.1 durante el spike evita adoptar un minor sin necesidad demostrada. El coordinador puede resolver esta propuesta antes de fijar el lockfile. Los polyfills FormatJS y los datos IANA/locale requeridos por el handoff aún necesitan resolución explícita y prueba de empaquetado; esta investigación no verificó sus pins.

## Desarrollo y tests

| Paquete | Versión candidata exacta | Evidencia / compatibilidad |
|---|---|---|
| typescript | 6.0.3 | devDependency ~6.0.3 del template Expo 57.0.30 |
| @types/react | 19.2.2 | devDependency ~19.2.2 del template Expo 57.0.30 |
| jest | 29.7.0 | Engines compatibles; alineado con dependencias internas Jest 29 de jest-expo |
| jest-expo | 57.0.6 | Matriz SDK 57; peer @react-native/jest-preset ^0.86.3 |
| @react-native/jest-preset | 0.86.3 | Peer exacto de RN 0.86.3; peer React ^19.2.3 |
| @types/jest | 29.5.14 | Último 29.x observado en npm |
| @testing-library/react-native | 14.1.0 | React >=19, RN >=0.78, Jest >=29, test-renderer ^1.0; Node ^22.13 o >=24 |
| test-renderer | 1.2.0 | **Pin exacto obligatorio**: reconciler ~0.33.0, peer React ^19.2.0 |
| @playwright/test | 1.64.0 | npm; Playwright 1.64.0, Node >=20; licencia Apache-2.0 |
| tsx | 4.23.15 | npm; Node >=18; esbuild ~0.28.0; MIT |
| eslint-config-expo | 57.0.2 | Matriz SDK 57; resolución del CLI/lint por coordinador |

### Hallazgo de peers que afecta a una instalación reproducible

No usar `test-renderer@latest` (1.3.1 observado). Aunque su peer directo anuncia React ^19.0.0, depende de `react-reconciler@~0.34.0`, cuyo peer exige React **^19.3.0**. Esto no coincide con React 19.2.3 de SDK 57. `test-renderer@1.2.0` depende de reconciler ~0.33.0; npm confirma que 0.33.0 pide React ^19.2.0. No poner `^1.2.0`, pues permitiría resolver 1.3.1.

`jest-expo@57.0.6` todavía trae `react-test-renderer@19.2.3` transitivamente. La guía moderna de RNTL usa `test-renderer`; no añadir el paquete antiguo como dependencia directa de tests ni intentar retirar a mano una dependencia interna del preset. Un smoke test real debe verificar ambos caminos.

RNTL 14 usa APIs asíncronas: leer sus guías incluidas en el paquete antes de escribir tests; no copiar recetas de RNTL 13. Los mocks de jest-expo no demuestran disco, SQLite ni capacidades nativas.

## SQLite Web: contrato del spike

Expo SDK 57 sigue documentando soporte Web **alpha**, necesidad de WASM y SharedArrayBuffer con aislamiento de origen, y ausencia de `withExclusiveTransactionAsync` en Web. Deben probarse estos aspectos en Chromium real:

1. Metro resuelve `.wasm`; workers y WASM se cargan desde recursos locales.
2. Servidor devuelve COOP `same-origin` y COEP `require-corp`; `crossOriginIsolated === true`. La documentación de hosting también muestra `credentialless`, pero el handoff exige `require-corp`, válido para recursos locales compatibles.
3. Apertura y migración de una base real; escritura confirmada después de commit; recarga/cierre/reapertura conservan registros.
4. Rollback real de fallo intencional, operaciones concurrentes serializadas y lecturas consistentes. Toda operación pasa por la cola del repositorio; no exponer una conexión libre que pueda colarse en una transacción async.
5. Detectar segunda pestaña y coordinar escrituras o limitarla a lectura. Capturar error reproducible si falla SQLite Web; solo entonces usar IndexedDB persistente bajo el mismo contrato.

No afirmar persistencia por un mock o estado en memoria. No convertir éxito Web en certificación de SQLite Android. APK, Hermes real, archivos/compartir Android, permisos y lifecycle quedan pendientes del gate específico.

## Fuentes primarias y comandos observados

- [Expo: matriz de SDK](https://docs.expo.dev/versions/latest/): SDK 57 / RN 0.86 / React 19.2.3 / RN Web 0.21.0 / Node mínimo 22.13.x; Android 7+, compile/target SDK 36.
- [Expo SDK 57](https://expo.dev/changelog/sdk-57) y [changelog](https://expo.dev/changelog): SDK 57 estable; SDK 58 beta.
- [Matriz empaquetada oficial sdk-57](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo/bundledNativeModules.json): rangos compatibles de módulos y runtimes.
- [SQLite SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/): Web alpha, WASM/headers, restricciones transaccionales.
- [Instalación manual Router](https://docs.expo.dev/router/installation/).
- [Expo: Jest](https://docs.expo.dev/develop/unit-testing/).
- [RNTL: inicio](https://oss.callstack.com/react-native-testing-library/docs/start/quick-start): renderer nuevo y documentación incluida.
- [Playwright: instalación](https://playwright.dev/docs/intro).
- [Node.js: releases](https://nodejs.org/en/about/previous-releases): Node 24 LTS.
- [date-fns/tz: changelog](https://raw.githubusercontent.com/date-fns/tz/main/CHANGELOG.md).
- [Registro npm Expo](https://registry.npmjs.org/expo/57.0.28), [template mínimo](https://registry.npmjs.org/expo-template-blank-typescript/57.0.30), [template default](https://registry.npmjs.org/expo-template-default/57.0.30).
- [Registro npm RNTL](https://registry.npmjs.org/@testing-library%2freact-native/14.1.0), [renderer elegido](https://registry.npmjs.org/test-renderer/1.2.0), [reconciler compatible](https://registry.npmjs.org/react-reconciler/0.33.0), [reconciler incompatible](https://registry.npmjs.org/react-reconciler/0.34.0).

Consultas ejecutadas en lectura: `node --version`, `npm view expo dist-tags --json`, `npm view expo-template-default dist-tags --json`, `npm view <paquete>@<version> version engines peerDependencies peerDependenciesMeta dependencies license --json`, y devDependencies de ambos templates. Consulta exploratoria `test-renderer@1.2.1`: E404 (no existe); candidato corregido a la versión existente 1.2.0. No se ejecutó instalación ni smoke test en este subencargo.

## Combinación final y evidencia ejecutada

Pulido visual posterior autorizado: `expo-font@57.0.4`, ya presente transitivamente en Expo, queda fijado como dependencia directa. Se añaden seis archivos TTF locales Outfit/Manrope con licencia OFL, sin servicios externos en runtime. Expo compatibility y Doctor 21/21 se revalidaron en ese primer pase; ver `UI-POLISH.md` para el pase específico de fuentes, temas y pantallas.

Corrección de vidrio solicitada después: `expo-blur@57.0.3` se incorpora como dependencia exacta, compatible con `~57.0.3` de `expo/bundledNativeModules.json`. Web usa blur CSS con la paleta original; nativo usa BlurView y target compartido en Android. No se afirma equivalencia visual o rendimiento nativo desde los tests Web.

`package.json` y `package-lock.json` son la referencia instalada. Frente a las tablas candidatas: RN Web **0.21.2**, types/react **19.2.4**, Reanimated **4.5.1**, Worklets **0.10.1**, ESLint **9.39.5**, types/node **24.10.1**; `expo-status-bar` no es dependencia directa. FormatJS nativo quedó fijado: getcanonicallocales **3.2.12**, locale **5.3.12**, pluralrules **6.3.15**, numberformat **9.4.3**, datetimeformat **7.8.1**, segmenter **12.2.15**, con locales es/en y datos IANA empaquetados en el bootstrap nativo. Hermes real queda pendiente.

Se añadió `safe-uri-decoder: npm:decode-uri-component@0.5.0` y un puente Metro probado para el aviso de decodificación de URLs. La deuda restante y la diferencia entre inventario npm y alcance del bundle se explican en [dependency-audit.md](dependency-audit.md).

Resultados finales del coordinador: `expo install --check` PASS; **Expo Doctor 21/21 PASS** después del alias; typecheck y lint PASS; exportación Web PASS; **16/16 E2E** con SQLite Web real en Edge 155.0.4283.45. Fuente de evidencia: `output/verification/`, `output/playwright/results.json` y [CHECKPOINT.md](CHECKPOINT.md). No hay fallback de persistencia en memoria ni IndexedDB alternativo: el spike y la integración de SQLite Web pasaron. Los límites nativos siguen pendientes del gate separado.

## Adición local 0.5.0 — 2026-10-14

Se instaló `expo-notifications@57.0.22` con la matriz fijada de SDK 57 (`expo install --check` PASS). Autolinking y compilación Kotlin release verifican el módulo local `dailoop-glass` junto a Notifications. Sin librería gráfica adicional: Android 13+ usa AGSL de plataforma y Web SVG. El lockfile conserva las versiones anteriores de RN/Reanimated/Worklets. Ver RECORDATORIOS-RACHAS-0.5.0.md para permisos y límites nativos.
