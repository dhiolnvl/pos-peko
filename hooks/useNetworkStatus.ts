import { useEffect, useState } from 'react';
import * as Network from 'expo-network';

/**
 * useNetworkStatus hook
 * Monitors network connectivity status
 */
export const useNetworkStatus = () => {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean>(true);
  const [networkType, setNetworkType] = useState<Network.NetworkStateType | null>(null);

  useEffect(() => {
    // Check initial network state
    checkNetworkState();

    // Poll network state every 5 seconds
    const interval = setInterval(checkNetworkState, 5000);

    return () => clearInterval(interval);
  }, []);

  const checkNetworkState = async () => {
    try {
      const state = await Network.getNetworkStateAsync();

      setIsConnected(state.isConnected ?? false);
      setIsInternetReachable(state.isInternetReachable ?? false);
      setNetworkType(state.type);
    } catch (error) {
      console.error('Failed to check network state:', error);
      setIsConnected(false);
      setIsInternetReachable(false);
    }
  };

  return {
    isConnected,
    isInternetReachable,
    isOnline: isConnected && isInternetReachable,
    networkType,
    refresh: checkNetworkState,
  };
};
