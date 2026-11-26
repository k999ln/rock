'use client';
import { createContext, useContext } from 'react';
export const NoahBrowserReady = createContext(true);
export const useNoahBrowserReady = () => useContext(NoahBrowserReady);
