(function($){

    var bip32_source_key = null;
    var bip32_derivation_path = null;
    var gen_from = "pass";
    var hash_worker = null;
    var hash_worker_working = false;
    var bip32_passphrase_hash = null;

    var TIMEOUT = 600;
    var timeout = null;

    var coin = "btc_main";

    var COINS = {
        btc_main: {
            name: "Bitcoin",
            network: "Mainnet",
            prefix: 0,
            private_prefix: 0+0x80,
            bip32_public: BITCOIN_MAINNET_PUBLIC,
            bip32_private: BITCOIN_MAINNET_PRIVATE
        },
        btc_test: {
            name: "Bitcoin",
            network: "Testnet",
            prefix: 0x6f,
            private_prefix: 0x6f+0x80,
            bip32_public: BITCOIN_TESTNET_PUBLIC,
            bip32_private: BITCOIN_TESTNET_PRIVATE
        },
        doge_main: {
            name: "Dogecoin",
            network: "Mainnet",
            prefix: 0x1e,
            private_prefix: 0x1e+0x80,
            bip32_public: DOGECOIN_MAINNET_PUBLIC,
            bip32_private: DOGECOIN_MAINNET_PRIVATE
        },
        doge_test: {
            name: "Dogecoin",
            network: "Testnet",
            prefix: 0x71,
            private_prefix: 0x71+0x80,
            bip32_public: DOGECOIN_TESTNET_PUBLIC,
            bip32_private: DOGECOIN_TESTNET_PRIVATE
        },
        jbs_main: {
            name: "Jumbucks",
            network: "Mainnet",
            prefix: 0x2b,
            private_prefix: 0x2b+0x80,
            bip32_public: JUMBUCKS_MAINNET_PUBLIC,
            bip32_private: JUMBUCKS_MAINNET_PRIVATE
        },
        ltc_main: {
            name: "Litecoin",
            network: "Mainnet",
            prefix: 0x30,
            private_prefix: 0x30+0x80,
            bip32_public: LITECOIN_MAINNET_PUBLIC,
            bip32_private: LITECOIN_MAINNET_PRIVATE
        },
        ltc_test: {
            name: "Litecoin",
            network: "Testnet",
            prefix: 0x6f,
            private_prefix: 0x6f+0x80,
            bip32_public: LITECOIN_TESTNET_PUBLIC,
            bip32_private: LITECOIN_TESTNET_PRIVATE
        }
    };

    var PUBLIC_KEY_VERSION = 0;
    var PRIVATE_KEY_VERSION = 0x80;
    var ADDRESS_URL_PREFIX = 'http://blockchain.info/address/'
    var BIP32_TYPE = BITCOIN_MAINNET_PRIVATE;

    function pad(str, len, ch) {
        padding = '';
        for (var i = 0; i < len - str.length; i++) {
            padding += ch;
        }
        return padding + str;
    }

    function setWarningState(field, err, msg) {
        var group = field.closest('.form-group');
        if (err) {
            group.removeClass('has-error').addClass('has-warning');
            group.attr('title', msg);
        } else {
            group.removeClass('has-warning').removeClass('has-error');
            group.attr('title', '');
        }
    }

    function setErrorState(field, err, msg) {
        var group = field.closest('.form-group');
        if (err) {
            group.removeClass('has-warning').addClass('has-error');
            group.attr('title',msg);
        } else {
            group.removeClass('has-warning').removeClass('has-error');
            group.attr('title','');
        }
    }

    function pad2(s) {
        if(s.length == 1) return '0' + s;
        return s;
    }

    function pad8(s) {
        while(s.length < 8) s = '0' + s;
        return s;
    }

    function byteArrayToHexString(a) {
        var s = '';
        for( var i in a ) {
            s = s + pad2(a[i].toString(16));
        }
        return s;
    }

    // --- bip32 ---

    function onUpdateGenFrom() {
        gen_from = $(this).attr('id').substring(5);
        updateGenFrom();
    }

    function updateGenFrom() {
        if( gen_from == 'pass' ) {
            $("#bip32_source_passphrase").attr('readonly', false);
            $("#bip32_source_key").attr('readonly', true);
            $("#gen_from_msg").html("Your passphrase is hashed using 50,000 rounds of HMAC-SHA256");
        } else {
            setErrorState($("#bip32_source_passphrase"), false);
            $("#bip32_source_passphrase").attr('readonly', true);
            $("#bip32_source_key").attr('readonly', false);
            stop_hash_worker();
            $("#cancel_hash_worker").attr('disabled', true);
            $("#gen_from_msg").html("You can manually enter an Extended Private or Public key");
        }
    }

    function onUpdateSourcePassphrase() {
        clearTimeout(timeout);
        timeout = setTimeout(updateSourcePassphrase, TIMEOUT);
        setWarningState($("#bip32_source_passphrase"), false);
    }

    function onShowPassphraseChanged() {
        if($(this).is(":checked")) {
            $("#bip32_source_passphrase").attr('type', 'text');
        } else {
            $("#bip32_source_passphrase").attr('type', 'password');
        }
    }

    function onCancelHashWorkerClicked() {
        stop_hash_worker();

        var passphrase = $("#bip32_source_passphrase").val();
        bip32_passphrase_hash = Crypto.util.bytesToHex(Crypto.SHA256(passphrase, { asBytes: true }));
        updatePassphraseHash();

        setWarningState($("#bip32_source_passphrase"), true, "The passphrase was hashed using a single SHA-256 and should be considered WEAK and INSECURE");
    }

    function updateSourcePassphrase() {
        var passphrase = $("#bip32_source_passphrase").val();
        if( typeof(Worker) === undefined ) {
            setErrorState($("#bip32_source_passphrase"), true, "Your browser doesn't support Web Workers");
        } else {
            setErrorState($("#bip32_source_passphrase"), false);
        }

        try {
            start_hash_worker(passphrase);
        } catch (err) {
            setErrorState($("#bip32_source_passphrase"), true, "Your browser doesn't support Web Workers: " + err.toString());
            alert("It appears your browser cannot load or execute web workers.  If you are running locally using Chrome, run with the --allow-file-access-from-files option or use a HTTP server such as Python (python3 -m http.server)");
        }
    }

    function updatePassphraseHash() {
        var hasher = new jsSHA(bip32_passphrase_hash, 'HEX');   
        var I = hasher.getHMAC("Bitcoin seed", "TEXT", "SHA-512", "HEX");
        var il = Crypto.util.hexToBytes(I.slice(0, 64));
        var ir = Crypto.util.hexToBytes(I.slice(64, 128));

        var gen_bip32 = new BIP32();
        try {
            gen_bip32.eckey = new Bitcoin.ECKey(il);
            gen_bip32.eckey.pub = gen_bip32.eckey.getPubPoint();
            gen_bip32.eckey.setCompressed(true);
            gen_bip32.eckey.pubKeyHash = Bitcoin.Util.sha256ripe160(gen_bip32.eckey.pub.getEncoded(true));
            gen_bip32.has_private_key = true;

            gen_bip32.chain_code = ir;
            gen_bip32.child_index = 0;
            gen_bip32.parent_fingerprint = Bitcoin.Util.hexToBytes("00000000");
            gen_bip32.version = COINS[coin].bip32_private;
            gen_bip32.depth = 0;

            gen_bip32.build_extended_public_key();
            gen_bip32.build_extended_private_key();
        } catch (err) {
            setErrorState($('#bip32_source_passphrase'), true, '' + err);
            return;
        }

        setErrorState($('#bip32_source_passphrase'), false);

        $("#bip32_source_key").val(gen_bip32.extended_private_key_string("base58"));
        updateSourceKey();
    }

    function isMasterKey(k) {
        return k.child_index == 0 && k.depth == 0 && 
               ( k.parent_fingerprint[0] == 0 && k.parent_fingerprint[1] == 0 && k.parent_fingerprint[2] == 0 && k.parent_fingerprint[3] == 0 );
    }

    function onUpdateSourceKey() {
        clearTimeout(timeout);
        timeout = setTimeout(updateSourceKey, TIMEOUT);
    }

    function updateSourceKey() {
        $("#bip32_key_info_title").html('');
        $("#bip32_key_info_version").val('');
        $("#bip32_key_info_depth").val('');
        $("#bip32_key_info_parent_fingerprint").val('');
        $("#bip32_key_info_child_index").val('');
        $("#bip32_key_info_chain_code").val('');
        $("#bip32_key_info_key").val('');

        setErrorState($('#bip32_source_key'), false);

        try {
            var source_key_str = $("#bip32_source_key").val();
            if(source_key_str.length == 0) return;
            bip32_source_key = new BIP32(source_key_str);
        } catch(err) {
            bip32_source_key = null;
            setErrorState($('#bip32_source_key'), true, 'Invalid key: ' + err.toString());
            return;
        }

        //console.log(bip32_source_key);
        updateSourceKeyInfo();
        updateDerivationPath();
    }

    function getCoinFromKey(k) {
        for(var coin_name in COINS) {
            var c = COINS[coin_name];
            if(k.version == c.bip32_public || k.version == c.bip32_private) {
                return c;
            }
        }

        return null;
    }

    function updateSourceKeyInfo() {
        var key_coin = getCoinFromKey(bip32_source_key);

        if( isMasterKey(bip32_source_key) ) {
            if( bip32_source_key.has_private_key ) {
                $("#bip32_key_info_title").html("<b>" + key_coin.name + " Master Private Key</b>");
            } else {
                $("#bip32_key_info_title").html("<b>" + key_coin.name + " Master Public Key</b>");
            }
        } else {
            if( bip32_source_key.has_private_key ) {
                $("#bip32_key_info_title").html("<b>" + key_coin.name + " Derived Private Key</b>");
            } else {
                $("#bip32_key_info_title").html("<b>" + key_coin.name + " Derived Public Key</b>");
            }
        }

        var v = '' + pad8(bip32_source_key.version.toString(16));
        if( bip32_source_key.has_private_key ) v = v + " (" + key_coin.name + " " + key_coin.network + " private key)";
        else                                   v = v + " (" + key_coin.name + " " + key_coin.network + " public key)";

        $("#bip32_key_info_version").val(v);

        $("#bip32_key_info_depth").val('' + bip32_source_key.depth);

        $("#bip32_key_info_parent_fingerprint").val('' + pad2(bip32_source_key.parent_fingerprint[0].toString(16)) +
                                                         pad2(bip32_source_key.parent_fingerprint[1].toString(16)) +
                                                         pad2(bip32_source_key.parent_fingerprint[2].toString(16)) +
                                                         pad2(bip32_source_key.parent_fingerprint[3].toString(16)));

        $("#bip32_key_info_child_index").val(bip32_source_key.child_index);
        $("#bip32_key_info_chain_code").val('' + byteArrayToHexString(bip32_source_key.chain_code));

        if( bip32_source_key.has_private_key ) {
            var bytes = [key_coin.private_prefix].concat(bip32_source_key.eckey.priv.toByteArrayUnsigned()).concat([1]);
            var checksum = Crypto.SHA256(Crypto.SHA256(bytes, {asBytes: true}), {asBytes: true}).slice(0, 4);
            $("#bip32_key_info_key").val(Bitcoin.Base58.encode(bytes.concat(checksum)));

        } else {
            var bytes = Crypto.util.bytesToHex(bip32_source_key.eckey.pub.getEncoded(true));
            $("#bip32_key_info_key").val(bytes);
        }

        return;
    }

    function onUpdateDerivationPath() {
        updateDerivationPath();
    }

    function onUpdateCustomPath() {
        clearTimeout(timeout);
        timeout = setTimeout(updateDerivationPath, TIMEOUT);
    }

    function onAccountIndexChanged() {
        clearTimeout(timeout);
        timeout = setTimeout(updateDerivationPath, TIMEOUT);
    }

    function onKeypairIndexChanged() {
        clearTimeout(timeout);
        timeout = setTimeout(updateDerivationPath, TIMEOUT);
    }

    function updateDerivationPath() {
        bip32_derivation_path = $("#bip32_derivation_path :selected").val();

        if( bip32_derivation_path == "custom" ) {
            $("#custom_group").show();
            bip32_derivation_path = $("#bip32_custom_path").val();
        } else {
            $("#custom_group").hide();
        }

        if( bip32_derivation_path.indexOf('/k/') >= 0 || bip32_derivation_path.indexOf('/k\'/') >= 0 ) {
            $("#account_group").show();
        } else {
            $("#account_group").hide();
        }

        if( bip32_derivation_path.indexOf('/i/') >= 0 || 
            bip32_derivation_path.indexOf('/i\'/') >= 0 || 
            bip32_derivation_path.slice(bip32_derivation_path.length-2) == "/i" ||
            bip32_derivation_path.slice(bip32_derivation_path.length-3) == "/i'" ) {
            $("#child_group").show();
        } else {
            $("#child_group").hide();
        }

        updateResult();
    }

    function updateResult() {
        var p = '' + bip32_derivation_path;
        var k = parseInt($("#account_index").val());
        var i = parseInt($("#keypair_index").val());

        p = p.replace('i', i).replace('k', k);

        setErrorState($('#bip32_derivation_path'), false);
        $("#derived_private_key").val('');
        $("#derived_public_key").val('');
        $("#derived_private_key_wif").val('');
        $("#derived_public_key_hex").val('');
        $("#addr").val('');
        $("#genAddrQR").val('');

        try {
            if(bip32_source_key == null) {
                // if this is the case then there's an error state set on the source key
                return;
            }
            console.log("Deriving: " + p);
            var result = bip32_source_key.derive(p);
        } catch (err) {
            setErrorState($('#bip32_derivation_path'), true, 'Error deriving key: ' + err.toString());
            return;
        }

        var key_coin = getCoinFromKey(result);

        if( result.has_private_key ) {
            $("#derived_private_key").val(result.extended_private_key_string("base58"));

            var privkeyBytes = result.eckey.priv.toByteArrayUnsigned();
            while (privkeyBytes.length < 32) {
                privkeyBytes.unshift(0);
            };
            var bytes = [key_coin.private_prefix].concat(privkeyBytes).concat([1]);
            var checksum = Crypto.SHA256(Crypto.SHA256(bytes, {asBytes: true}), {asBytes: true}).slice(0, 4);
            $("#derived_private_key_wif").val(Bitcoin.Base58.encode(bytes.concat(checksum)))
        } else {
            $("#derived_private_key").val("No private key available");
            $("#derived_private_key_wif").val("No private key available");
        }

        $("#derived_public_key").val(result.extended_public_key_string("base58"));
        $("#derived_public_key_hex").val(Crypto.util.bytesToHex(result.eckey.pub.getEncoded(true)));
 
        var hash160 = result.eckey.pubKeyHash;
        var addr = new Bitcoin.Address(hash160);
        addr.version = key_coin.prefix;
        $("#addr").val(addr.toString());

        var qrCode = qrcode(3, 'M');
        var text = $('#addr').val();
        text = text.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
        qrCode.addData(text);
        qrCode.make();

        $('#genAddrQR').html(qrCode.createImgTag(4));
        $('#genAddrURL').attr('href', ADDRESS_URL_PREFIX+text);
        $('#genAddrURL').attr('title', text);
    }

    function onInput(id, func) {
        $(id).bind("input keyup keydown keypress change blur", function() {
            if ($(this).val() != jQuery.data(this, "lastvalue")) {
                func();
            }
            jQuery.data(this, "lastvalue", $(this).val());
        });
        $(id).bind("focus", function() {
           jQuery.data(this, "lastvalue", $(this).val());
        });
    }

    function crChange(e)
    {
        var key_coin = getCoinFromKey(bip32_source_key);

        e.preventDefault();
        coin = $(this).attr("id");
        ADDRESS_URL_PREFIX = $(this).attr('href');
        $('#crName').text($(this).text());
        $('#crSelect').dropdown('toggle');

        if( gen_from == 'pass' && bip32_source_key === null ) {
            updateSourcePassphrase();
        } else if( bip32_source_key !== null ) {
            if( COINS[coin].prefix != key_coin.prefix ) { // key is changing to another realm..
                var is_private = (bip32_source_key.version == key_coin.bip32_private);
                var is_public = (bip32_source_key.version == key_coin.bip32_public);

                if( is_public ) {
                    bip32_source_key.version = COINS[coin].bip32_public;
                    bip32_source_key.build_extended_public_key();
                    $("#bip32_source_key").val(bip32_source_key.extended_public_key_string("base58"));
                } else if( is_private ) {
                    bip32_source_key.version = COINS[coin].bip32_private;
                    bip32_source_key.build_extended_public_key();
                    bip32_source_key.build_extended_private_key();
                    $("#bip32_source_key").val(bip32_source_key.extended_private_key_string("base58"));
                }
            }

            updateSourceKey();
        }

        return false;
    }

    // -- web worker for hashing passphrase --
    function hash_worker_message(e) {
        // ignore the hash worker
        if(!hash_worker_working) return;

        var m = e.data;
        switch(m.cmd) {
        case 'progress':
            $("#bip32_hashing_progress_bar").width('' + m.progress + "%");
            break;
        case 'done':
            $("#bip32_hashing_progress_bar").width('100%');
            $("#bip32_hashing_style").removeClass("active");
            $("#cancel_hash_worker").attr('disabled', true);
            hash_worker_working = false;
            bip32_passphrase_hash = m.result;
            updatePassphraseHash();
            break;
        }
        console.log(m);
    }

    function start_hash_worker(passphrase) {
        if( hash_worker === null ) {
            hash_worker = new Worker("js/hash_worker.js");
            hash_worker.addEventListener('message', hash_worker_message, false);
        }

        bip32_passphrase_hash = null;
        bip32_source_key = null;

        $("#bip32_source_key").val('');
        updateSourceKey();
        updateResult();

        $("#bip32_hashing_progress_bar").css('width', '0%');
        $("#bip32_hashing_style").addClass("active");

        hash_worker_working = true;
        $("#cancel_hash_worker").attr('disabled', false);
        hash_worker.postMessage({"cmd": "start", "bip32_source_passphrase": passphrase});
    }
    
    function stop_hash_worker() {
        $("#cancel_hash_worker").attr('disabled', true);
        hash_worker_working = false;
        $("#bip32_hashing_progress_bar").css("width", "0%");
        if( hash_worker != null ) {
            hash_worker.postMessage({"cmd": "stop"});
        }
    }

    $(document).ready( function() {

        if (window.location.hash)
          $('#tab-' + window.location.hash.substr(1).split('?')[0]).tab('show');

        $('a[data-toggle="tab"]').on('click', function (e) {
            window.location.hash = $(this).attr('href');
        });

        // bip32

        $('#gen_from label input').on('change', onUpdateGenFrom );
        updateGenFrom();

        $("#bip32_source_passphrase").val("crazy horse battery staple");
        $("#bip32_source_key").val("xprv9s21ZrQH143K2JF8RafpqtKiTbsbaxEeUaMnNHsm5o6wCW3z8ySyH4UxFVSfZ8n7ESu7fgir8imbZKLYVBxFPND1pniTZ81vKfd45EHKX73");
        onInput("#bip32_source_passphrase", onUpdateSourcePassphrase);

        $("#checkbox_show_passphrase").on('change', onShowPassphraseChanged );

        $("#cancel_hash_worker").on('click', onCancelHashWorkerClicked);
        onInput("#bip32_source_key", onUpdateSourceKey);
        $("#bip32_hashing_progress_bar").width('100%');
        $("#cancel_hash_worker").attr('disabled', true);
        updateSourceKey();

        $('#bip32_derivation_path').on('change', onUpdateDerivationPath);
        onInput("#bip32_custom_path", onUpdateCustomPath);
        onInput("#account_index", onAccountIndexChanged);
        onInput("#keypair_index", onKeypairIndexChanged);

        updateDerivationPath();

        // currency select

        $('#crCurrency ul li a').on('click', crChange);

    });
})(jQuery);
