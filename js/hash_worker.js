importScripts("crypto-min.js");
importScripts("sha256.js");

(function() {
    var state = 'stopped';
    var bip32_source_passphrase = null;
    var last = null;
    var index = 0;
    var COUNT = 50000;
    var STEP  = 500;
    
    function message_handler(e) {
        var m = e.data;
    
        switch (m.cmd) {
        case 'start':
            last = Crypto.util.hexToBytes("0000000000000000000000000000000000000000000000000000000000000000"); // 256-bit 0
            bip32_source_passphrase = m.bip32_source_passphrase;
            state = 'start';
            break;
        case 'stop':
            state = 'stopped';
            break;
        default:
            break;
        };
    }
    
    self.addEventListener('message', message_handler, false);
    
    function main() {
        var loop = 0;
        for(var loop = 0; loop < 100; loop++) {
            switch(state) {
            case 'stopped':
                setTimeout(main, 1000);
                return;
            case 'start':
                self.postMessage({'cmd': 'progress', 'progress': 0});
                index = 0;
                state = 'hashing';
                // fall through
            case 'hashing':
                var hasher = new jsSHA(Crypto.util.bytesToHex(last), 'HEX');   
                last = Crypto.util.hexToBytes(hasher.getHMAC(bip32_source_passphrase, "TEXT", "SHA-256", "HEX"));
                index += 1;

                if( index >= COUNT ) {
                    self.postMessage({'cmd': 'done', 'result': Crypto.util.bytesToHex(last)});
                    state = 'stopped';
                } else if( (index % STEP) == 0 ) {
                    self.postMessage({'cmd': 'progress', 'progress': Math.floor((100 * index / COUNT) + 0.5)});
                }
                break;
            default:
                break;
            }
        }

        // we use this style of run-some, wait-some to allow the browser to parse messages,
        // allowing us to restart/stop mid-hash
        setTimeout(main, 0);
    }
    
    main();
})();
