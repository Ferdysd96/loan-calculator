# Calculadora de amortización

Aplicación web (HTML, CSS y JavaScript) para calcular la cuota mensual de un préstamo, ver la tabla de amortización mes a mes y simular **abonos extraordinarios** con dos estrategias distintas. Los montos se muestran en **pesos dominicanos (RD$)**.

## Cómo ejecutar la aplicación

No hace falta instalar dependencias ni un servidor obligatorio.

1. Descarga o clona la carpeta del proyecto.
2. Abre el archivo **`index.html`** con tu navegador (doble clic o arrastrar el archivo a Chrome, Edge, Firefox, etc.).

Si prefieres un servidor local (por ejemplo para evitar restricciones de algunos navegadores al abrir archivos locales), puedes usar cualquier servidor estático en la raíz del proyecto.

## Qué puedes hacer

### Datos del préstamo

- **Monto del préstamo**: capital inicial.
- **Tasa de interés anual (%)**: se convierte a tasa mensual para los cálculos.
- **Plazo (años)**: duración del préstamo en años (se trabaja internamente en meses).

Al cambiar cualquier valor, los resultados y la tabla se **actualizan al instante**.

### Abonos extraordinarios

Puedes añadir una o varias filas con:

- **Mes**: en qué mes del préstamo se aplica el abono (el listado de meses depende del plazo en años).
- **Monto del abono**: cantidad extra que pagas a capital ese mes.
- **Estrategia**:
  - **Reducir plazo**: mantiene la cuota base y acorta el tiempo total del préstamo.
  - **Reducir cuota**: mantiene el plazo restante y recalcula una **cuota mensual menor** para los meses siguientes.

**Varios abonos en el mismo mes:** si programas más de un abono en un mes, se aplican **en el orden en que aparecen** en la lista.

**Botones:**

- **+ Agregar abono extra**: añade una nueva fila de abono.
- **Limpiar abonos**: elimina todos los abonos programados.

### Resumen numérico

- **Cuota mensual base**: cuota del préstamo **sin** abonos extraordinarios (escenario de referencia).
- **Ahorro estimado en intereses**: diferencia de intereses totales entre el escenario sin extras y el escenario con tus abonos.
- **Meses estimados**: duración real del préstamo con tus abonos.
- **Meses ahorrados**: meses que dejas de pagar respecto al plazo original (cuando aplica).
- **Intereses totales** y **Total pagado**: correspondientes al escenario **con** abonos extraordinarios.

Si el préstamo se liquida antes de algún mes donde tenías abonos programados, esos abonos posteriores **no se aplican** y verás un **aviso** indicando cuántos abonos se ignoraron.

### Tabla de amortización

Muestra mes a mes: cuota, interés, capital y saldo pendiente. Los meses con abono extraordinario se resaltan e incluyen una etiqueta con el monto extra aplicado.

## Cómo se calcula la cuota (referencia)

La cuota mensual base sigue la fórmula estándar de amortización:

`Cuota = P × i / (1 − (1 + i)^−n)`

Donde **P** es el principal, **i** la tasa mensual (tasa anual ÷ 12 ÷ 100) y **n** el número de meses.

## Estructura del proyecto

```
loan-calculator/
├── index.html      # Página principal
├── css/styles.css  # Estilos
├── js/main.js      # Lógica de cálculo y la interfaz
└── readme.md       # Este archivo
```

## Notas

- La aplicación funciona **solo en el navegador**; los datos no se envían a ningún servidor.
- Los resultados son **simulaciones**; para decisiones financieras confirma siempre las condiciones con tu entidad prestamista.
