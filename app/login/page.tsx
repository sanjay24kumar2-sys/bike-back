"use client";
import { Button } from "@heroui/react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { FiArrowRight } from "react-icons/fi";

export default function LoginPage() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAuthenticate = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ authcode: code.trim() }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
        generatedCode?: string;
      };

      if (response.ok) {
        if (typeof data.generatedCode === "string" && data.generatedCode) {
          alert(`Your new login code is: ${data.generatedCode}`);
        }

        window.location.href = "/all";
      } else {
        setError(data.message || "Authentication failed. Please try again.");
        setLoading(false);
      }
    } catch (error) {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen text-white flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden"
      style={{
        backgroundImage: "url('/hacker-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Overlay for better text readability */}
      <div className="absolute inset-0 bg-linear-to-b from-black/30 via-black/25 to-black/35 backdrop-blur-md" />

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 w-full max-w-md flex flex-col items-center justify-center space-y-8"
      >
        {/* Header - APK HUNTER */}
        <div className="text-center space-y-4">
          {/* Title with line decorators */}
          <div className="flex items-center justify-center gap-4">
            <div className="h-px w-8 sm:w-12 bg-cyan-500" />
        <h1 className="text-3xl sm:text-4xl font-bold tracking-[0.32em] text-[#8B0000] drop-shadow-[0_0_10px_rgba(255,0,0,0.6)]">
  Anonymous
</h1>
            <div className="h-px w-8 sm:w-12 bg-cyan-500" />
          </div>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-xs sm:text-sm tracking-[0.2em] text-cyan-400 uppercase font-semibold"
          >
            Secure Access Node
          </motion.p>
        </div>

        {/* Welcome Message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="space-y-6 w-full"
        >
          <div className="text-center space-y-4">
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight drop-shadow-lg">
              Welcome
              <br />
            </h2>

            {    }
            <p className="text-xs sm:text-sm text-gray-200 leading-relaxed max-w-sm mx-auto drop-shadow-md">
              Authenticate to enter the APK Hunter command console. This portal is
              shielded with end-to-end encryption and monitored for intrusion
              attempts.
            </p>
          </div>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="w-full flex flex-col gap-3 sm:gap-4"
        >
          {/* Login Button */}
          <button
            onClick={() => setOpen(true)}
            className="w-full px-6 py-3 sm:py-4 border-2 border-cyan-500 bg-black/20 hover:bg-cyan-500/20 text-white rounded-lg transition-all duration-300 hover:shadow-[0_0_25px_rgba(0,255,150,0.5)] font-semibold text-sm sm:text-base uppercase tracking-wider drop-shadow-lg backdrop-blur-sm"
          >
            LOGIN
          </button>

          {}
             <a
href="https://t.me/Sanajy_Misra00?text=Misra%20jii%20I%20need%20an%20admin%20panel"
  target="_blank"
  rel="noreferrer"
  className="w-full px-6 py-3 sm:py-4 border-2 border-cyan-400 bg-black/20 hover:bg-cyan-400/20 text-cyan-300 rounded-lg transition-all duration-300 hover:shadow-[0_0_25px_rgba(0,255,200,0.6)] font-semibold text-sm sm:text-base uppercase tracking-wider flex items-center justify-center gap-2 group drop-shadow-lg backdrop-blur-sm"
>
  Contact on Telegram
  <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
</a>
        </motion.div>

        {/* Footer - Tech info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-center pt-4 border-t border-gray-700"
        >
          <p className="text-[10px] sm:text-xs text-gray-500 font-mono">
            Secure encrypted connection • End-to-end protected
          </p>
        </motion.div>
      </motion.div>

      {/* Login Modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 30, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-cyan-500/30 bg-linear-to-b from-gray-900/95 to-black/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="mb-6 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                    Authentication Required
                  </p>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white">
                  Sign In
                </h2>
              </div>

              {/* Form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs sm:text-sm font-semibold text-gray-300 uppercase tracking-wider">
                    Access Code
                  </label>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyPress={(e) =>
                      e.key === "Enter" && handleAuthenticate()
                    }
                    placeholder="Enter your access code..."
                    className="w-full rounded-lg border border-cyan-500/30 bg-gray-900/50 px-4 py-3 text-sm text-gray-200 placeholder-gray-500 outline-none transition duration-200 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 focus:bg-gray-900/70"
                  />
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-red-500/30 bg-red-900/20 p-3 text-xs sm:text-sm text-red-300"
                  >
                    {error}
                  </motion.div>
                )}

                <Button
                  onPress={handleAuthenticate}
                  disabled={loading}
                  className="w-full rounded-lg bg-cyan-500 text-black font-bold text-sm sm:text-base py-3 sm:py-4 hover:bg-cyan-400 transition-all duration-200 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                        className="h-4 w-4 rounded-full border-2 border-black/30 border-t-black"
                      />
                      Authenticating...
                    </span>
                  ) : (
                    "AUTHENTICATE"
                  )}
                </Button>
              </div>

              { }
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setOpen(false)}
                className="absolute top-4 right-4 rounded-full border border-gray-600 p-2 text-gray-400 transition hover:border-cyan-400 hover:text-cyan-400"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}