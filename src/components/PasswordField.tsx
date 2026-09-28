"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { showByDefault?: boolean };

/** Password input with a show / hide eye button. */
export default function PasswordField({ showByDefault = false, className = "", ...props }: Props) {
  const [show, setShow] = useState(showByDefault);
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className={`input pr-11 ${className}`} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-1 top-1/2 flex h-8 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        aria-label={show ? "Hide password" : "Show password"}
        title={show ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
