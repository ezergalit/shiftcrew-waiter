import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error, info) {
    console.error("App crashed:", error, info);
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="h-full flex flex-col items-center justify-center bg-[#16181c] px-6 text-center gap-4">
          <div className="text-6xl">😵</div>
          <h2 className="text-xl font-bold text-gray-800">משהו השתבש</h2>
          <p className="text-gray-500 text-sm">אפשר לנסות לרענן את הדף</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-brand-500 text-white font-bold px-6 py-3 rounded-2xl active:bg-brand-600">
            רענן
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
