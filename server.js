const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

// Almacenamiento temporal de transacciones
const baseDeDatosTransacciones = [];

// Endpoint para procesar el pago y hacer la conversión
app.post('/api/pagar', async (req, res) => {
  const { montoCLP, nombreCliente, emailCliente } = req.body;

  try {
    // 1. Consultar la tasa de cambio actual (CLP a COP) en tiempo real
    const respuestaTasa = await axios.get('https://open.er-api.com/v6/latest/CLP');
    const tasaCOP = respuestaTasa.data.rates.COP;

    // 2. Calcular el valor equivalente en Colombia
    const montoCOP = montoCLP * tasaCOP;

    // 3. Crear el registro de la transacción
    const nuevaTransaccion = {
      id: 'tx_' + Date.now(),
      nombreCliente,
      emailCliente,
      montoCLP,
      tasaAplicada: tasaCOP,
      montoCOP: montoCOP.toFixed(2),
      estado: 'APROBADO',
      fecha: new Date()
    };

    baseDeDatosTransacciones.push(nuevaTransaccion);

    // 4. Responder con los datos de la conversión
    res.json({
      exito: true,
      mensaje: '¡Conversión y pago simulado con éxito!',
      transaccion: nuevaTransaccion
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      exito: false,
      mensaje: 'Hubo un error al procesar la conversión'
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});
  
