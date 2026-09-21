import { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export function useHealthStatus() {
  const [healthStatus, setHealthStatus] = useState({ backend: 'checking', aiService: 'checking' });

  useEffect(() => {
    let cancelled = false;

    axios
      .get(`${API_BASE_URL}/api/v1/health`)
      .then((res) => {
        if (cancelled) return;
        setHealthStatus({
          backend: res.data.status === 'UP' ? 'up' : 'down',
          aiService: res.data.ai_service?.status === 'UP' ? 'up' : 'down',
        });
      })
      .catch(() => {
        if (!cancelled) setHealthStatus({ backend: 'down', aiService: 'down' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return healthStatus;
}
