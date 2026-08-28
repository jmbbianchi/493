import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'

// Direccion visual "Obra". tokens.css primero: base.css depende de sus variables.
import './styles/tokens.css'
import './styles/base.css'

// BrowserRouter y no HashRouter: las URLs tienen que poder pegarse en un
// mensaje. Los links profundos funcionan porque staticwebapp.config.json
// reescribe todo a /index.html.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
