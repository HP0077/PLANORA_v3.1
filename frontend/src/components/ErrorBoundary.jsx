import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props){
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error){
    return { hasError: true, error }
  }
  componentDidCatch(error, info){
    // eslint-disable-next-line no-console
    console.error('UI Error:', error, info)
  }
  render(){
    if(this.state.hasError){
      return (
        <div style={{ padding: 16 }}>
          <h2 style={{ fontWeight: 700 }}>Something went wrong.</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error)}</pre>
          <p>Try refreshing the page. If this persists, please share the above message.</p>
        </div>
      )
    }
    return this.props.children
  }
}
