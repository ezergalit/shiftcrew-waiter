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
        // Brand palette, not Tailwind defaults: text-gray-800 on this background was
        // unreadable, and bg-brand-500 isn't a configured colour here at all.
        <div dir="rtl" className="h-full flex flex-col items-center justify-center bg-[#0c0d10] px-6 text-center gap-4">
          <div className="text-6xl">😵</div>
          <h2 className="text-xl font-black text-[#eef0f6]">משהו השתבש</h2>
          <p className="text-[#8a8aa0] text-sm">אפשר לנסות לרענן את הדף</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-[#22c08c] text-[#06231a] font-black px-6 py-3 rounded-2xl active:opacity-90">
            רענון
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
