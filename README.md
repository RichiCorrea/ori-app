# WorshipFlow Prototype

Primera prueba ejecutable del proyecto.

Esta version valida el corazon de la app:

- Transport global
- BPM
- Play / pausa / stop
- Tap tempo
- Cambio de escenas
- Crossfade simple entre pads
- Audio generado en el navegador
- Base PWA

## Como ejecutarlo en el computador

1. Abre una terminal en esta carpeta:

   E:\OneDrive\Documentos\Richi-app

2. Ejecuta:

   node dev-server.js

3. Abre en el navegador:

   http://localhost:5173

## Como probarlo en iPhone

1. Deja el comando `node dev-server.js` abierto en el computador.
2. Asegurate de que el iPhone y el computador esten en la misma red Wi-Fi.
3. Busca la IP local del computador.
4. En Safari del iPhone abre:

   http://IP-DEL-COMPUTADOR:5173

Ejemplo:

   http://192.168.1.25:5173

## Que probar como QA

- Tocar Play debe iniciar el audio.
- El contador Beat debe avanzar.
- El contador Compas debe subir cada 4 beats.
- El slider Tempo debe cambiar el BPM.
- Tap debe calcular un nuevo BPM.
- Cambiar de escena debe cambiar el pad sin cortar en seco.
- Stop debe volver a compas 1, beat 1.

## Prueba 1: cambio musical de escenas

- Tocar `Click Off` debe activar el click y cambiar a `Click On`.
- En Play, tocar otra escena no debe cambiar inmediatamente.
- La escena tocada debe quedar marcada como pendiente.
- El cambio real debe ocurrir al llegar al proximo compas.
- El pad debe cambiar con crossfade.
- El BPM debe actualizarse al BPM de la nueva escena.

## Prueba 2: loop sincronizado

- Tocar `Loop Off` sin Play debe dejar el loop listo.
- Tocar Play con el loop listo debe hacerlo sonar siguiendo el beat.
- Con Play activo, tocar `Loop Off` o `Loop On` no debe cambiar inmediatamente.
- El cambio debe quedar pendiente hasta el proximo compas.
- El loop debe mantenerse alineado con el click.
- Al cambiar BPM por escena, el loop debe seguir el nuevo tempo.
- Stop debe apagar el loop y volver a compas 1, beat 1.

## Prueba 3: mixer basico

- Los controles Pad, Loop y Click deben modificar volumen de forma independiente.
- Bajar Pad debe permitir escuchar mejor el Loop.
- Bajar Click no debe afectar Pad ni Loop.
- Bajar Loop no debe afectar Pad ni Click.
- Los cambios de volumen deben sentirse suaves, sin cortes fuertes.

## Prueba 4: mute y reset de canal

- El boton `M` debe silenciar el canal sin detener la reproduccion.
- El boton `M` debe estar al lado derecho del canal.
- Al quitar `M`, el canal debe volver al volumen anterior.
- Mutear Pad no debe afectar Loop ni Click.
- Mutear Loop no debe afectar Pad ni Click.
- Mutear Click no debe afectar Pad ni Loop.
- Doble click o doble touch sobre un canal debe volver al nivel inicial.
- El reset tambien debe quitar el mute de ese canal.
- El mixer debe poder colapsarse y expandirse.
- Al colapsar el mixer, las escenas deben quedar mas faciles de ver.

## Prueba 5: drum engine minimo

- Tocar `Drums Off` sin Play debe dejar los drums listos.
- Tocar Play con drums listos debe iniciar el patron.
- Con Play activo, tocar `Drums On` debe dejar apagado pendiente para el proximo compas.
- Volver a tocar debe dejar encendido pendiente para el proximo compas.
- Los drums deben seguir el BPM del Transport Global.
- Al cambiar de escena y BPM, los drums deben mantenerse sincronizados.
- El canal Drums del mixer debe controlar volumen y mute de forma independiente.
- Stop debe apagar drums y volver a compas 1, beat 1.

## Prueba 6: drums por escena y kit

- Cada escena debe tener un patron de drums distinto.
- Warm Pad debe sonar mas suave.
- Deep Pad debe sonar mas espaciado.
- Bright Pad debe sonar mas activo.
- Al cambiar escena, el patron debe cambiar en el proximo compas.
- El selector Drum Kit debe cambiar el tipo de sonido sin detener el transport.
- Los kits Soft, Tight y Big deben sentirse diferentes.
- El mixer Drums debe seguir funcionando con cualquier kit.

## Prueba 7: editor basico de drums

- El boton de encendido de Drums debe estar junto al titulo Drum Editor.
- El selector Drum Kit debe estar dentro del bloque Drum Editor.
- El editor debe mostrar 16 steps.
- Debe tener filas Kick, Snare y Hat.
- Tocar un step debe activarlo o desactivarlo.
- El cambio debe escucharse en vivo mientras el transport corre.
- Al cambiar de escena, debe cargarse el patron de esa escena.
- Editar Warm no debe modificar Deep ni Bright.
- El indicador visual debe mostrar el step que esta sonando.
- El editor debe poder colapsarse y expandirse.

## Prueba 8: rate del drum machine

- El control `1/2`, `1x`, `x2`, `x4` debe afectar solo a Drums.
- El BPM global no debe cambiar.
- `1/2` debe hacer que el patron avance mas lento.
- `1x` debe volver al avance normal.
- `x2` debe hacer que el patron avance mas rapido.
- `x4` debe hacer que el patron avance cuatro veces mas rapido.
- Pads, Loop y Click deben mantenerse en el Transport Global.

## Prueba 9: persistencia local

- Los patrones editados deben mantenerse al recargar la pagina.
- El Drum Kit seleccionado debe mantenerse al recargar.
- El rate `1/2`, `1x`, `x2`, `x4` debe mantenerse al recargar.
- Volumenes y mutes del mixer deben mantenerse al recargar.
- El estado colapsado/expandido de Mixer debe mantenerse.
- El estado colapsado/expandido de Drum Editor debe mantenerse.

## Prueba 10: reset de patron

- El boton Reset debe restaurar solo el patron de la escena actual.
- Reset no debe cambiar Drum Kit.
- Reset no debe cambiar volumenes ni mutes.
- Reset no debe modificar los patrones editados en otras escenas.
- El patron restaurado debe mantenerse al recargar.

## Prueba 11: scene manager basico

- El campo Nombre debe mostrar el nombre de la escena actual.
- El campo BPM debe mostrar el BPM de la escena actual.
- El campo Tonalidad debe guardar la tonalidad de la escena actual.
- El campo Compas debe guardar 4/4, 3/4, 2/4, 4/8, 6/8, 9/8 o 12/8.
- `Guardar` debe guardar nombre, BPM, tonalidad y compas en la escena actual.
- Cambiar BPM de escena debe actualizar el Transport.
- `Nueva` debe crear una escena nueva desde cero.
- `Duplicar` debe crear una nueva escena a partir de la escena actual.
- La escena duplicada debe copiar BPM, pad y patron de drums editado.
- El contador Beat debe respetar el compas de la escena.
- Las escenas nuevas deben mantenerse al recargar.
- Cambiar de escena en Play debe seguir entrando en el proximo compas.

## Prueba 12: grilla adaptativa por compas

- El Drum Editor debe cambiar cantidad de steps segun el compas.
- 2/4 debe mostrar 8 steps.
- 3/4 debe mostrar 12 steps.
- 4/4 debe mostrar 16 steps.
- 5/4 debe mostrar 20 steps.
- 4/8 debe mostrar 8 steps.
- 6/8 debe mostrar 12 steps agrupados de 3 en 3.
- 7/8 debe mostrar 14 steps agrupados 2+2+3.
- 9/8 debe mostrar 18 steps agrupados de 3 en 3.
- 12/8 debe mostrar 24 steps agrupados de 3 en 3.
- El playback debe recorrer solo los steps visibles del compas actual.
- Los patrones guardados deben ajustarse al cambiar de compas.

## Prueba 13: acentos y grooves por defecto

- El click debe acentuar segun el compas.
- El click debe diferenciar strong, medium y weak.
- 4/4 debe sonar strong, weak, medium, weak.
- 6/8 debe sonar strong, weak, weak, medium, weak, weak.
- 9/8 debe sonar strong, weak, weak, medium, weak, weak, medium, weak, weak.
- 12/8 debe sonar strong en 1 y medium en 4, 7 y 10.
- El selector Groove debe ofrecer Auto, Rock, Pop, Blues, Waltz y Bossa.
- Rock y Pop deben fijar 4/4.
- Blues debe fijar 12/8.
- Waltz debe fijar 3/4.
- Bossa debe fijar 2/4.
- Cambiar Groove debe regenerar el patron de la escena actual y ajustar el compas correspondiente.
- Cambiar Compas manualmente debe dejar el patron vacio para no inventar grooves incorrectos.
- Reset debe restaurar el patron segun Groove y Compas.

## Prueba 14: scheduler con Web Audio clock

- Click, drums y loop deben programarse contra `AudioContext.currentTime`.
- La UI no debe ser la fuente del timing musical.
- Click y drums deben mantenerse alineados durante varios minutos.
- `x2` y `x4` deben sonar como subdivisiones reales entre pulsos.
- Cambiar BPM debe mantener el scheduler estable.
- Cambiar escena en Play debe seguir ocurriendo en el proximo compas.
- Pausa/Stop no deben dejar golpes de drums pendientes.

## Prueba 15: drum events internos

- Los patrones existentes deben seguir sonando igual despues de recargar.
- Los patrones guardados con el formato anterior deben abrir sin errores.
- Tocar steps en Kick, Snare y Hat debe activar/desactivar golpes como antes.
- Reset debe restaurar el groove por defecto de la escena actual.
- Duplicar una escena debe copiar el patron completo, incluso en 5/4, 7/8, 9/8 o 12/8.
- El Groove debe seguir fijando su compas correcto.
- El motor queda preparado para velocity/acento por golpe sin cambiar la UI actual.

## Prueba 16: acento por golpe

- Un toque sobre un step debe activarlo o desactivarlo.
- Activar `Accent` debe cambiar el editor a modo de acentos.
- En modo `Accent`, tocar un step debe alternarlo entre normal y acentuado.
- Un doble toque sobre un step tambien debe intentar alternar el acento como atajo.
- El step acentuado debe verse mas marcado que un step normal.
- El acento debe sonar con mas intensidad, sin cambiar el volumen general del canal Drums.
- Los acentos deben mantenerse al cambiar de escena y al recargar.
- Reset debe restaurar los acentos por defecto del groove.

## Prueba 17: renombrar y borrar escenas

- Editar el campo Nombre y tocar `Renombrar` debe cambiar solo el nombre de la escena actual.
- `Guardar` debe guardar nombre, BPM, tonalidad, compas, kit, rate, sonidos K/S/H y patron actual.
- `Borrar` debe pedir confirmacion antes de eliminar la escena actual.
- Al borrar una escena, debe seleccionarse automaticamente una escena vecina.
- No debe permitirse borrar la ultima escena restante.
- Borrar una escena debe eliminar tambien su patron de drums guardado.
- Las escenas renombradas o borradas deben mantenerse al recargar.

## Prueba 18: sonidos por instrumento

- El Drum Editor no debe mostrar un bloque extra de sonidos sobre la grilla.
- Tocar la inicial lateral K debe abrir el menu de sonido del Kick.
- Tocar la inicial lateral S debe abrir el menu de sonido del Snare.
- Tocar la inicial lateral H debe abrir el menu de sonido del Hat.
- Cambiar el selector del menu K debe modificar solo el sonido del Kick.
- Cambiar el selector del menu S debe modificar solo el sonido del Snare.
- Cambiar el selector del menu H debe modificar solo el sonido del Hat.
- Tocar `Load` en el menu de K, S o H debe permitir elegir un archivo mp3/wav para ese instrumento.
- Si hay un sample cargado, ese instrumento debe usar el sample en vez del sonido generado.
- Cambiar el selector de sonido debe desactivar el sample cargado y volver al sonido base.
- Tocar `Base` debe quitar el sample cargado y volver al sonido base sin cambiar el selector.
- El selector Kit debe seguir cambiando el caracter general de todo el drum machine.
- Cambiar sonidos no debe detener el transport ni modificar el patron.
- Las selecciones de K, S y H deben mantenerse al recargar.
- Los samples cargados deben guardarse en IndexedDB para seguir disponibles al recargar.

## Prueba 19: persistencia de samples

- Cargar un mp3/wav en K, S o H debe hacerlo sonar en ese instrumento.
- Recargar la pagina debe mantener el sample disponible.
- Al tocar Play despues de recargar, el sample guardado debe volver a sonar.
- Abrir el menu de un instrumento con sample guardado debe mostrar el titulo como Sample.
- Cambiar el selector debe quitar el sample guardado de ese instrumento.
- Tocar `Base` debe quitar el sample guardado de ese instrumento.
- Si el navegador no permite IndexedDB, la app debe seguir funcionando con sonidos base.

## Prueba 20: escenas en IndexedDB

- Crear una escena nueva debe guardarse en IndexedDB y seguir disponible al recargar.
- Renombrar una escena debe mantenerse al recargar.
- Borrar una escena debe mantenerse al recargar.
- Editar patrones, acentos, groove, kit, rate, sonidos K/S/H, mixer y UI debe seguir guardando.
- Si IndexedDB no esta disponible, la app debe seguir usando el guardado liviano anterior.
- Las escenas existentes de versiones anteriores deben seguir cargando.

## Prueba 21: primer refactor modular

- La app debe cargar usando `app.js` como modulo.
- Los datos musicales estaticos deben estar separados en `src/music-data.js`.
- La capa de guardado local e IndexedDB debe estar separada en `src/storage.js`.
- La UI debe verse igual que antes del refactor.
- Las escenas deben seguir cargando.
- El Drum Editor, menu K/S/H, Load/Base y escenas deben seguir funcionando.
- No debe haber errores de consola por imports o cache.

## Prueba 22: drum machine modular

- La logica pura de patrones y grooves debe estar separada en `src/drum-machine.js`.
- La app debe seguir cargando con `app.js` como modulo.
- La grilla debe mostrar los steps correctos por compas.
- Tocar steps debe seguir activando/desactivando golpes.
- El modo `Accent` debe seguir alternando acentos.
- Reset debe seguir restaurando el patron segun groove/compas.
- Los menus K/S/H deben seguir abriendo y mostrando Load/Base.
- No debe haber errores de consola por imports o cache.

## Prueba 23: guardar preset actual

- Cambiar Tonalidad debe actualizar la tarjeta de escena inmediatamente.
- Cambiar BPM con slider o campo BPM debe poder guardarse en la escena.
- Cambiar Compas debe actualizar la grilla inmediatamente y poder guardarse.
- Tocar `Guardar` debe guardar el preset con compas, tonalidad, tempo, patron dibujado, kit, rate y sonidos K/S/H.
- Recargar debe mantener tonalidad, compas, tempo y patron guardado.
- Cambiar de escena debe restaurar kit, rate y sonidos K/S/H guardados en esa escena cuando existan.
- Una escena guardada con sonidos base debe volver a sonidos base aunque otra escena use samples.
- Una escena guardada con samples debe volver a usar samples al regresar a esa escena.
- Tocar `Base` o cambiar selector K/S/H debe desactivar el sample solo para el preset actual, sin borrar el sample de otras escenas.
- Cada escena debe poder tener samples K/S/H propios sin reemplazar los samples de otra escena.
- Cargar un sample en una escena debe asociarlo a esa escena y ese instrumento.

## Prueba 24: transporte fijo superior

- La barra de transporte debe quedar fija arriba al hacer scroll.
- Debe ocupar aprox. 1/6 de la pantalla.
- Debe mostrar Play/Pause alternado, Stop y Metronome como botones compactos.
- El metrónomo debe verse como icono, no como letra M.
- La tonalidad debe mostrar la etiqueta Key debajo.
- Debe mostrar tonalidad, BPM, compas, beat y cifra.
- Play debe iniciar sin depender de volver arriba.
- Pause debe pausar sin detener totalmente el estado.
- Stop debe volver a compas 1 beat 1.
- Metronome debe activarse/desactivarse desde la barra fija.
- El contenido no debe quedar tapado debajo de la barra.

## Prueba 25: Pad Synth v1

- La seccion Pad Synth debe aparecer entre Mixer y Drum Editor.
- Mood debe cambiar el caracter del pad sin romper la reproduccion.
- Movement, Shimmer, Warmth, Space y Texture deben actualizar sus porcentajes.
- Evolve debe alternar activo/inactivo y quedar guardado por escena.
- Cambiar tonalidad debe reconstruir el pad en la nueva key.
- Cada escena debe recordar su mood y controles de pad.
- Al cambiar de escena mientras suena, el pad debe hacer crossfade suave.
- La seccion Pad Synth debe poder colapsarse.

## Prueba 26: contraste sonoro Pad Synth

- Prayer debe sonar calido y estable.
- Heaven debe sonar mas brillante, alto y con shimmer evidente.
- Epic debe sonar mas grande y con mas cuerpo.
- Intimate debe sonar mas suave y cercano.
- Dark Ambient debe sonar mas grave y oscuro.
- Cinematic debe sonar mas ancho, denso y espacial.
- Movement debe hacer mas evidente el movimiento del filtro y del delay.
- Warmth debe aumentar cuerpo, detune y saturacion suave.
- Texture debe agregar aire o ruido filtrado sin dominar el pad.

## Prueba 27: shimmer tipo bloom

- Shimmer en 0% debe dejar el pad casi sin cola brillante.
- Shimmer sobre 70% debe generar una cola elevada y espacial, no solo mas volumen.
- Heaven debe tener shimmer mas brillante y ancho que Prayer.
- Dark Ambient debe conservar shimmer oscuro, sin exceso de agudos.
- Space debe alargar el bloom y el feedback de la cola.
- El shimmer debe entrar suave despues del ataque inicial del pad.
- Al cambiar de mood no debe aparecer un golpe brusco ni clipping.

## Prueba 28: shimmer premium v1

- El shimmer debe sentirse detras del pad, no como un sonido agudo pegado encima.
- La cola debe tener un bloom lento con reflexiones estereo.
- Space debe aumentar la longitud y profundidad de la cola sin embarrar el ataque.
- Heaven debe recordar una reverb brillante tipo worship shimmer.
- Prayer debe conservar un brillo sutil y oscuro.
- Cinematic debe sentirse ancho y grande, pero sin volumen excesivo.
- Al tocar Stop o cambiar escena, el shimmer debe apagarse con fade sin cola cortada bruscamente.

## Prueba 29: shimmer FDN hibrido v1

- El shimmer debe sonar como una cola que crece detras del pad, no como una capa pegada encima.
- Shimmer en 0% debe dejar el pad casi sin cola brillante.
- Shimmer en 80-100% debe generar una cola ancha, densa y musical sin artefactos mecanicos.
- Prayer debe tener un shimmer oscuro y controlado, con cola larga pero no intrusiva.
- Heaven debe sonar brillante y amplio, como reverb de worship de alta calidad.
- Dark Ambient debe conservar shimmer muy sutil y oscuro.
- Cinematic debe sentirse ancho, grande y envolvente.
- Epic debe tener mas shimmer que Prayer pero menos intrusivo que Heaven.
- Space en 0% debe generar cola corta; Space en 100% debe generar cola muy larga.
- La cola no debe tener resonancias metalicas ni pitidos al subir Shimmer.
- Cambiar de escena o tocar Stop debe apagar el shimmer con fade suave sin cortes.
- No debe escucharse ninguna artefacto tipo Doppler ni modulacion obvia en el shimmer.

## Prueba 30: shimmer reverb v2 — cuerpo + pre-difusion + feedback largo

- El shimmer debe sentirse como una reverb real, no como osciladores con eco.
- Debe haber sensacion de espacio grande y difuso detras del pad.
- El cuerpo del pad debe alimentar el shimmer sutilmente, asi el shimmer "nace" del sonido.
- Las voces octava dobles (±3 cents) deben crear anchura natural sin chorus obvia.
- Con Shimmer al 70%+ en Heaven, debe escucharse una nube armonica amplia y densa.
- La cola debe tener RT60 de 1.7–2.7 s cuando el pad se detiene.
- No debe haber feedback infinito ni distorsion con ninguna combinacion de controles.
- El shimmer sutil de Prayer (shimmerLevel=0.80) debe ser apenas perceptible pero presente.
- El shimmer de Intimate (shimmerLevel=0.38) debe ser casi inaudible.
- La pre-difusion debe suavizar el sonido metalico de los combs: no debe sonar a delay con pitch.

## Proxima meta

Mejorar estructura del proyecto:

- Separar audio engine y UI en modulos internos antes de migrar a React/Expo.

Luego convertir esta prueba en una app React organizada por capas:

- UI
- Application
- State
- Audio Engine
- Storage
