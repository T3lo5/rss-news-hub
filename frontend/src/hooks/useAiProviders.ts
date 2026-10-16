import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { AiProviderList } from '../types';

// Module-level cache so the provider list is fetched once per page load and
// shared by every dropdown (ShareModal, Newsletter builder, Digest, ...).
let cache: AiProviderList | null = null;
let inflight: Promise<AiProviderList> | null = null;

export function __resetAiProvidersCache() {
  cache = null;
  inflight = null;
}

// Returns null until the list has been loaded, so callers can distinguish
// "not loaded yet" (do not disable anything) from "loaded, some unconfigured".
export function useAiProviders(enabled = true): AiProviderList | null {
  const [data, setData] = useState<AiProviderList | null>(cache);

  useEffect(() => {
    if (!enabled || cache) return;
    let alive = true;

    inflight = inflight || api.getAiProviders();
    inflight
      .then((list) => {
        cache = list;
        if (alive) setData(list);
      })
      .catch(() => {
        inflight = null;
      });

    return () => {
      alive = false;
    };
  }, [enabled]);

  return data;
}
