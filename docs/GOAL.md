# Objetivo

Convertir `obra493` de una calculadora de materiales en un **gestor de
proyectos de obra**: una app donde cada obra vive adentro de sí misma y
donde, para cada rubro, se ven al lado los tres números que importan —lo
teórico, lo presupuestado y lo pagado— y las diferencias entre ellos.

## Por qué

Un presupuesto de obra en Argentina no es un monto: es un acuerdo con un
plan de pago que se mueve con la inflación. El cementista dice
$85.000.000 y termina costando $88.002.640, y ese número no está escrito
en ningún papel. Hacerlo visible, antes de que la obra se desvíe, es la
razón de ser de esta app.

## Terminado significa

Jose puede abrir la app en el teléfono parado en la obra, registrar en
quince segundos el pago que le acaba de hacer al albañil, y ver en el
acto cuánto le queda de ese presupuesto y si está pagando más rápido de
lo que la obra avanza.

Y un arquitecto puede entrar con su cuenta, ver sólo sus obras, y usar el
mismo motor.

## Cómo trabajar

Leé `docs/PLAN.md` antes de tocar nada. Tiene el estado real verificado,
las siete etapas con su criterio de aceptación, las decisiones ya tomadas
que no hay que volver a discutir, y las reglas duras que si se rompen
rompen producción —la base que no puede tener pool de conexiones, el
puerto que no puede ser menor a 1024, los números que no pueden ir en
tipografía monoespaciada.

Una etapa por vez, verificada en producción, no en local.

Al final del plan hay cinco preguntas abiertas. **No las inventes.**
Preguntá.

## Empezá por

**E1, el caparazón.** Menú lateral, selector de obra visible y rutas de
verdad. Hoy la app se ve como cuatro hojas de Excel sueltas y ése es el
reclamo que Jose viene haciendo hace tres conversaciones. Es lo único que
no depende de nada más.
