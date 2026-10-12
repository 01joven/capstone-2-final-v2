import { useEffect, useRef } from 'react';

const usePolling = (callback, intervalMs = 10000) => {
  const callbackRef = useRef(callback);
  const busyRef = useRef(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || busyRef.current) return;
      busyRef.current = true;
      try {
        await callbackRef.current();
      } finally {
        busyRef.current = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const interval = window.setInterval(refresh, intervalMs);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs]);
};

export default usePolling;
