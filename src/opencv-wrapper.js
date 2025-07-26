// OpenCV.js wrapper following TechStark pattern
let cvReadyPromise = null;

export function getOpenCv() {
    if (!cvReadyPromise) {
        cvReadyPromise = new Promise((resolve, reject) => {
            // Check if cv is already loaded
            if (typeof cv !== 'undefined' && cv.Mat) {
                resolve(cv);
                return;
            }
            
            // Wait for OpenCV to be ready
            const checkReady = () => {
                if (typeof cv !== 'undefined') {
                    if (cv.onRuntimeInitialized) {
                        const originalCallback = cv.onRuntimeInitialized;
                        cv.onRuntimeInitialized = () => {
                            originalCallback();
                            resolve(cv);
                        };
                    } else if (cv.Mat) {
                        // OpenCV is already initialized
                        resolve(cv);
                    } else {
                        // Wait a bit more
                        setTimeout(checkReady, 100);
                    }
                } else {
                    // cv not loaded yet
                    setTimeout(checkReady, 100);
                }
            };
            
            checkReady();
            
            // Timeout after 30 seconds
            setTimeout(() => {
                reject(new Error('OpenCV.js failed to load after 30 seconds'));
            }, 30000);
        });
    }
    
    return cvReadyPromise;
}

export function translateException(err) {
    if (typeof err === "number" && window.cv) {
        try {
            const exception = window.cv.exceptionFromPtr(err);
            return exception;
        } catch (error) {
            // ignore
        }
    }
    return err;
}

// Helper function to ensure OpenCV is ready before use
export async function ensureOpenCvReady() {
    const cv = await getOpenCv();
    window.cv = cv;
    return cv;
}