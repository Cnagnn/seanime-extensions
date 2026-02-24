declare function LoadDoc(html: string): any;

declare namespace CryptoJS {
    namespace enc {
        const Base64: {
            parse(data: string): any;
        };
        const Utf8: {
            stringify(data: any): string;
            parse(data: string): any;
        };
    }
    const AES: {
        encrypt(message: string, secret: string): any;
        decrypt(ciphertext: string, secret: string): any;
    };
}
