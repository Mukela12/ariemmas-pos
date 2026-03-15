import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { installBrowserMock } from './lib/browserMock'
import './styles/globals.css'

installBrowserMock().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
