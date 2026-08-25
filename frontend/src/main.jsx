import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Direccion visual "Obra". tokens.css primero: base.css depende de sus variables.
import './styles/tokens.css'
import './styles/base.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
