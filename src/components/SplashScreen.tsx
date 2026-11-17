import React, { useEffect } from 'react';
import { ArrowLeft, HardDrive, ShieldCheck } from 'lucide-react';
import { APP_NAME, APP_VERSION, OWNER_NAME } from '../domain/seedData';

interface SplashScreenProps {
  onContinue: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onContinue }) => {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onContinue();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [onContinue]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-blue-700 via-blue-800 to-teal-700 p-6 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/20 bg-white/10 p-8 text-center shadow-2xl backdrop-blur-md">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl bg-white/15 p-3 shadow-inner ring-1 ring-white/25">
          <img
            src={`${import.meta.env.BASE_URL}icon.svg`}
            alt={APP_NAME}
            className="h-full w-full object-contain"
          />
        </div>

        <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          {APP_NAME}
        </h1>

        <div className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2 text-base font-extrabold text-slate-900 shadow-[0_3px_0_0_#b45309]">
          <ShieldCheck className="h-5 w-5" />
          <span>{OWNER_NAME}</span>
        </div>

        <p className="mt-5 text-sm text-blue-100">
          إدارة جرد مخزون التموين وحساب الاستعاضة وإعداد الفاتورة بدقة
        </p>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-blue-100/90">
          <HardDrive className="h-4 w-4" />
          <span>يعمل محلياً دون إنترنت · الإصدار {APP_VERSION}</span>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="btn-3d mt-7 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-base font-bold text-blue-800 shadow-[0_4px_0_0_#cbd5e1] hover:bg-blue-50"
        >
          <span>دخول إلى لوحة التحكم</span>
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};
