(function($){

    var bip32_source_key = null;
    var bip32_derivation_path = null;
    var gen_from = "pass";

    var TIMEOUT = 600;
    var timeout = null;

    var coin = "btc_main";

    var PUBLIC_KEY_VERSION = 0;
    var PRIVATE_KEY_VERSION = 0x80;
    var ADDRESS_URL_PREFIX = 'http://blockchain.info/address/'
    var BIP32_TYPE = MAINNET_PRIVATE;

    function pad(str, len, ch) {
        padding = '';
        for (var i = 0; i < len - str.length; i++) {
            padding += ch;
        }
        return padding + str;
    }

    function setErrorState(field, err, msg) {
        var group = field.closest('.controls');
        if (err) {
            group.addClass('has-error');
            group.attr('title',msg);
        } else {
            group.removeClass('has-error');
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
        } else {
            $("#bip32_source_passphrase").attr('readonly', true);
            $("#bip32_source_key").attr('readonly', false);
        }
    }

    function onUpdateSourcePassphrase() {
        clearTimeout(timeout);
        timeout = setTimeout(updateSourcePassphrase, TIMEOUT);
    }

    function updateSourcePassphrase() {
        var passphrase = $("#bip32_source_passphrase").val();

        var hash_str = Crypto.util.bytesToHex(Crypto.SHA256(passphrase, { asBytes: true }));

        var hasher = new jsSHA(hash_str, 'HEX');   
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
            gen_bip32.version = BIP32_TYPE;
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
        try {
            var source_key_str = $("#bip32_source_key").val();
            bip32_source_key = new BIP32(source_key_str);
        } catch(err) {
            bip32_source_key = null;
            setErrorState($('#bip32_source_key'), true, 'Invalid key: ' + err.toString());
            return;
        }
        setErrorState($('#bip32_source_key'), false);

        //console.log(bip32_source_key);
        updateSourceKeyInfo();
        updateDerivationPath();
    }

    function updateSourceKeyInfo() {
        if( isMasterKey(bip32_source_key) ) {
            if( bip32_source_key.has_private_key ) {
                $("#bip32_key_info_title").html("<b>Master Private Key</b>");
            } else {
                $("#bip32_key_info_title").html("<b>Master Public Key</b>");
            }
        } else {
            if( bip32_source_key.has_private_key ) {
                $("#bip32_key_info_title").html("<b>Derived Private Key</b>");
            } else {
                $("#bip32_key_info_title").html("<b>Derived Public Key</b>");
            }
        }

        var testnet = (bip32_source_key.version == TESTNET_PUBLIC || bip32_source_key.version == TESTNET_PRIVATE);

        var v = '' + pad8(bip32_source_key.version.toString(16));
        if( bip32_source_key.has_private_key ) v = v + " (" + (testnet ? "Testnet" : "Mainnet") + " private key)";
        else                                   v = v + " (" + (testnet ? "Testnet" : "Mainnet") + " public key)";

        $("#bip32_key_info_version").val(v);

        $("#bip32_key_info_depth").val('' + bip32_source_key.depth);

        $("#bip32_key_info_parent_fingerprint").val('' + pad2(bip32_source_key.parent_fingerprint[0].toString(16)) +
                                                         pad2(bip32_source_key.parent_fingerprint[1].toString(16)) +
                                                         pad2(bip32_source_key.parent_fingerprint[2].toString(16)) +
                                                         pad2(bip32_source_key.parent_fingerprint[3].toString(16)));

        $("#bip32_key_info_child_index").val(bip32_source_key.child_index);
        $("#bip32_key_info_chain_code").val('' + byteArrayToHexString(bip32_source_key.chain_code));

        if( bip32_source_key.has_private_key ) {
            var bytes = [testnet ? (PRIVATE_KEY_VERSION+0x6f) : PRIVATE_KEY_VERSION].concat(bip32_source_key.eckey.priv.toByteArrayUnsigned()).concat([1]);
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

        if( bip32_derivation_path.indexOf('/i/') >= 0 || bip32_derivation_path.indexOf('/i\'/') >= 0 ) {
            $("#account_group").show();
        } else {
            $("#account_group").hide();
        }

        if( bip32_derivation_path.indexOf('/k/') >= 0 || 
            bip32_derivation_path.indexOf('/k\'/') >= 0 || 
            bip32_derivation_path.slice(bip32_derivation_path.length-2) == "/k" ||
            bip32_derivation_path.slice(bip32_derivation_path.length-3) == "/k'" ) {
            $("#child_group").show();
        } else {
            $("#child_group").hide();
        }

        updateResult();
    }

    function onKeyDerivationChanged() {
        updateResult();
    }

    function updateResult() {
        var p = '' + bip32_derivation_path;
        var i = parseInt($("#account_index").val());
        var k = parseInt($("#keypair_index").val());

        p = p.replace('i', i).replace('k', k);

        var pubpriv = $('input[name="key_derivation"]:checked').attr('id');

        if( pubpriv == "key_derivation_private" && p[p.length-1] != "\'" ) {
            p = p + "\'";
        }

        try {
            console.log("Deriving: " + p);
            var result = bip32_source_key.derive(p);
        } catch (err) {
            setErrorState($('#bip32_derivation_path'), true, 'Error deriving key: ' + err.toString());
            $("#derived_private_key").val('');
            $("#derived_public_key").val('');
            $("#addr").val('');
            $("#genAddrQR").val('');
            return;
        }

        setErrorState($('#bip32_derivation_path'), false);

        if( result.has_private_key ) {
            $("#derived_private_key").val(result.extended_private_key_string("base58"));
        } else {
            $("#derived_private_key").val("No private key available");
        }

        $("#derived_public_key").val(result.extended_public_key_string("base58"));

        var testnet = (result.version == TESTNET_PUBLIC || result.version == TESTNET_PRIVATE);

        var hash160 = result.eckey.pubKeyHash;
        var addr = new Bitcoin.Address(hash160);
        addr.version = PUBLIC_KEY_VERSION + (testnet ? 0x6f : 0);
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
        e.preventDefault();
        coin = $(this).attr("id");
        ADDRESS_URL_PREFIX = $(this).attr('href');
        $('#crName').text($(this).text());
        $('#crSelect').dropdown('toggle');

        if( coin == "btc_main" ) BIP32_TYPE = MAINNET_PRIVATE;
        else if( coin == "btc_test" ) BIP32_TYPE = TESTNET_PRIVATE;

        if( gen_from == 'pass' ) updateSourcePassphrase();
        else if( gen_from == 'key' ) {
            if( ( bip32_source_key.version == MAINNET_PUBLIC || bip32_source_key.version == MAINNET_PRIVATE ) && coin == 'btc_test' ) {
                if( bip32_source_key.version == MAINNET_PUBLIC ) {
                    bip32_source_key.version = TESTNET_PUBLIC;
                    bip32_source_key.build_extended_public_key();
                    $("#bip32_source_key").val(bip32_source_key.extended_public_key_string("base58"));
                } else if( bip32_source_key.version == MAINNET_PRIVATE ) {
                    bip32_source_key.version = TESTNET_PRIVATE;
                    bip32_source_key.build_extended_public_key();
                    bip32_source_key.build_extended_private_key();
                    $("#bip32_source_key").val(bip32_source_key.extended_private_key_string("base58"));
                }
            } else if( ( bip32_source_key.version == TESTNET_PUBLIC || bip32_source_key.version == TESTNET_PRIVATE ) && coin == 'btc_main' ) {
                if( bip32_source_key.version == TESTNET_PUBLIC ) {
                    bip32_source_key.version = MAINNET_PUBLIC;
                    bip32_source_key.build_extended_public_key();
                    $("#bip32_source_key").val(bip32_source_key.extended_public_key_string("base58"));
                } else if( bip32_source_key.version == TESTNET_PRIVATE ) {
                    bip32_source_key.version = MAINNET_PRIVATE;
                    bip32_source_key.build_extended_public_key();
                    bip32_source_key.build_extended_private_key();
                    $("#bip32_source_key").val(bip32_source_key.extended_private_key_string("base58"));
                }
            }

            updateSourceKey();
        }

        return false;
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
        //$("#bip32_source_key").val("xprv9s21ZrQH143K2pUUptTR16Ji3MJpt9rfUq74vGyNqNdmTv6UBoRQKCTNS6zDKZzmVBBuZDzVf1uweMNyf1LmtZFvbmJqx7K1YAPPGitEtYG");
        onInput("#bip32_source_passphrase", onUpdateSourcePassphrase);
        onInput("#bip32_source_key", onUpdateSourceKey);
        updateSourcePassphrase();
        //updateSourceKey();

        $('#bip32_derivation_path').on('change', onUpdateDerivationPath);
        $('input[name="key_derivation"]').on('change', onKeyDerivationChanged);
        onInput("#bip32_custom_path", onUpdateCustomPath);
        onInput("#account_index", onAccountIndexChanged);
        onInput("#keypair_index", onKeypairIndexChanged);

        updateDerivationPath();

        // currency select

        $('#crCurrency ul li a').on('click', crChange);

    });
})(jQuery);
