'use client';
import { createContext } from 'react';
import type { NoahDetailPreview } from '@/lib/noah-detail-preview';
export const NoahDetailNavigation = createContext<(href: string, card: NoahDetailPreview) => void>(() => {});
