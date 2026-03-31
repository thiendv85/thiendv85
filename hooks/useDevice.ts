import { useState, useEffect } from 'react';

interface DeviceInfo {
    isMobile: boolean;   // < 768px
    isTablet: boolean;   // 768px - 1023px
    isDesktop: boolean;  // >= 1024px
}

export const useDevice = (): DeviceInfo => {
    const getDeviceInfo = (): DeviceInfo => {
        const w = window.innerWidth;
        return {
            isMobile: w < 768,
            isTablet: w >= 768 && w < 1024,
            isDesktop: w >= 1024,
        };
    };

    const [device, setDevice] = useState<DeviceInfo>(getDeviceInfo);

    useEffect(() => {
        const observer = new ResizeObserver(() => setDevice(getDeviceInfo()));
        observer.observe(document.documentElement);
        return () => observer.disconnect();
    }, []);

    return device;
};
