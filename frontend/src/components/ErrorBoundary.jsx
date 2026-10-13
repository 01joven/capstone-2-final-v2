import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unexpected UI error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-container">
          <p className="error-msg" role="alert">
            Something went wrong while displaying this page. Please reload the page or try again.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
