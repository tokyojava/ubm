import {useState} from "react";

export function useLoadingEffect(func: Function):
    [boolean, (...args: any[]) => Promise<any>] {
    const [isLoading, setIsLoading] = useState(false);
    const loadingFunc = async (...args: any[]) => {
        setIsLoading(true);
        try {
            // eslint-disable-next-line prefer-spread
            const result = await func.apply(null, args);
            return result;
        } finally {
            setIsLoading(false);
        }
    };
    return [isLoading, loadingFunc];
}
