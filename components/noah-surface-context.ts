'use client';
import { createContext, useContext } from 'react';
import type { NoahSurfaceMode } from '@/lib/noah-surface';
export const NoahSurfaceContext = createContext<{ mode: NoahSurfaceMode; base: string; hash: string } | null>(null);
export const useNoahSurface = () => useContext(NoahSurfaceContext);
