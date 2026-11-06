'use client';

import { create } from 'zustand';
import type { StorageStatus } from '@/types';

export const useStorageStatus = create<StorageStatus>(() => ({ mode: 'checking' }));
