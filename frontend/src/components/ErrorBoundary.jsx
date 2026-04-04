import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 500, marginBottom: '10px' }}>
            Something went wrong
          </h2>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
            An unexpected error occurred.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              background: '#000', color: '#fff', border: 'none',
              padding: '12px 24px', borderRadius: '6px', fontSize: '14px', cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
