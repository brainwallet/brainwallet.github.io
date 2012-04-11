(function($){

    var gen_from = 'passphrase';
    var gen_compressed = false;
    var gen_eckey = null;
    var gen_pt = null;
    var gen_ps_reset = false;
    var gen_timeout = 600;
    var timeout = null;

    function parseBase58Check(address) {
        var bytes = Bitcoin.Base58.decode(address);
        var end = bytes.length - 4;
        var hash = bytes.slice(0, end);
        var checksum = Crypto.SHA256(Crypto.SHA256(hash, {asBytes: true}), {asBytes: true});
        if (checksum[0] != bytes[end] ||
            checksum[1] != bytes[end+1] ||
            checksum[2] != bytes[end+2] ||
            checksum[3] != bytes[end+3]) {
          return [-1, []];
        }
        var version = hash.shift();
        return [version, hash];
    }

    encode_length = function(len) {
        if (len < 0x80) {
            return [len];
        } else if (len < 255) {
            return [0x80|1, len];
        } else {
            return [0x80|2, len >> 8, len & 0xff];
        }
    }
    
    encode_id = function(id, s) {
        var len = encode_length(s.length);
        return [id].concat(len).concat(s);
    }

    encode_integer = function(s) {
        if (typeof s == 'number') {
            s = [s];
        }
        return encode_id(0x02, s);
    }

    encode_octet_string = function(s)  {
        return encode_id(0x04, s);
    }

    encode_constructed = function(tag, s) {
        return encode_id(0xa0 + tag, s);
    }

    encode_bitstring = function(s) {
        return encode_id(0x03, s);
    }

    encode_sequence = function() {
        sequence = [];
        for (var i = 0; i < arguments.length; i++) {
            sequence = sequence.concat(arguments[i]);
        }
        return encode_id(0x30, sequence);
    }

    function getEncoded(pt, compressed) {
       var x = pt.getX().toBigInteger();
       var y = pt.getY().toBigInteger();
       var enc = integerToBytes(x, 32);
       if (compressed) {
         if (y.isEven()) {
           enc.unshift(0x02);
         } else {
           enc.unshift(0x03);
         }
       } else {
         enc.unshift(0x04);
         enc = enc.concat(integerToBytes(y, 32));
       }
       return enc;
    }

    function getDER(eckey, compressed) {
        var ecparams = getSECCurveByName("secp256k1");
        var _p = ecparams.getCurve().getQ().toByteArrayUnsigned();
        var _r = ecparams.getN().toByteArrayUnsigned();
        var encoded_oid = [0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x01, 0x01];

        var secret = integerToBytes(eckey.priv, 32);
        var encoded_gxgy = getEncoded(ecparams.getG(), compressed);
        var encoded_pub = getEncoded(gen_pt, compressed);

        return encode_sequence(
            encode_integer(1),
            encode_octet_string(secret),
            encode_constructed(0,
                encode_sequence(
                    encode_integer(1),
                    encode_sequence(
                        encoded_oid, //encode_oid(*(1, 2, 840, 10045, 1, 1)), //TODO
                        encode_integer([0].concat(_p))
                    ),
                    encode_sequence(
                        encode_octet_string([0]),
                        encode_octet_string([7])
                    ),
                    encode_octet_string(encoded_gxgy),
                    encode_integer([0].concat(_r)),
                    encode_integer(1)
                )
            ),
            encode_constructed(1, 
                encode_bitstring([0].concat(encoded_pub))
            )
        );
    }

    function pad(str, len, ch) {
        padding = '';
        for (var i = 0; i < len - str.length; i++) {
            padding += ch;
        }
        return padding + str;
    }

    function setErrorState(field, err, msg) {

        //group = field.parent().parent();

        group = field.closest('.control-group');


        if (err) {
            group.addClass('error');
        } else {
            group.removeClass('error');
        }

        var e = group.find('.errormsg');
        if (e) {
            e.text(msg||'');
        }
    }

    function get_radiobtn_id(obj, def) {
        res = def;
        obj.children().each(function(i) {
            if ($(this).hasClass('active'))
                res = $(this).attr('id');
        });
        return res;
    }

    function gen_random() {
        $('#pass').val('');
        $('#hash').focus();
        gen_from = 'secret';
        $('#secret').button('toggle');
        update_gen();
        var bytes = Crypto.util.randomBytes(32);
        $('#hash').val(Crypto.util.bytesToHex(bytes));
        clearTimeout(timeout);
        timeout = setTimeout(generate, gen_timeout);
    }

    function update_gen() {
        $('#pass').attr('readonly', gen_from != 'passphrase');
        $('#hash').attr('readonly', gen_from != 'secret');
        $('#sec').attr('readonly', gen_from != 'privkey');
        $('#sec').parent().parent().removeClass('error');
    }

    function update_gen_from() {
        gen_from = $(this).attr('id');
        update_gen();

        setErrorState($('#hash'), false);
        setErrorState($('#sec'), false);

        if (gen_from == 'passphrase') {

            if (gen_ps_reset) {
                gen_ps_reset = false;
                onChangePass();
            }
            $('#pass').focus();
        }

        if (gen_from == 'secret') {
            $('#hash').focus();
        }

        if (gen_from == 'privkey') {
            $('#sec').focus();
        }
    }

    function generate() {

        var hash_str = pad($('#hash').val(), 64, '0');
        var hash = Crypto.util.hexToBytes(hash_str);

        eckey = new Bitcoin.ECKey(hash);

        gen_eckey = eckey;

        try {
            var ecparams = getSECCurveByName("secp256k1");
            gen_pt = ecparams.getG().multiply(eckey.priv);
            gen_eckey.pub = getEncoded(gen_pt, gen_compressed);
            gen_eckey.pubKeyHash = Bitcoin.Util.sha256ripe160(gen_eckey.pub);
            var addr = eckey.getBitcoinAddress();
            setErrorState($('#hash'), false);
        } catch (err) {
            console.info(err);
            setErrorState($('#hash'), true, 'Invalid secret exponent (must be non-zero value)');
            return;
        }

        gen_update();
    }

    function update_gen_compressed() {
        setErrorState($('#hash'), false);
        setErrorState($('#sec'), false);
        gen_compressed = $(this).attr('id') == 'compressed';
        gen_eckey.pub = getEncoded(gen_pt, gen_compressed);
        gen_eckey.pubKeyHash = Bitcoin.Util.sha256ripe160(gen_eckey.pub);
        gen_update();
    }

    function gen_update() {

        var eckey = gen_eckey;
        var compressed = gen_compressed;

        var hash_str = pad($('#hash').val(), 64, '0');
        var hash = Crypto.util.hexToBytes(hash_str);

        var hash160 = eckey.getPubKeyHash();

        var addr = eckey.getBitcoinAddress();
        $('#addr').val(addr);

        var h160 = Crypto.util.bytesToHex(hash160);
        $('#h160').val(h160);

        var payload = hash;

        if (compressed)
            payload.push(0x01);

        var sec = new Bitcoin.Address(payload); sec.version = 128;
        $('#sec').val(sec);

        var pub = Crypto.util.bytesToHex(getEncoded(gen_pt, compressed));
        $('#pub').val(pub);

        var der = Crypto.util.bytesToHex(getDER(eckey, compressed));
        $('#der').val(der);

        var img = '<img src="http://chart.apis.google.com/chart?cht=qr&chs=255x250&chl='+addr+'">';

        if (true) {
            var qr = qrcode(3, 'M');
            var text = $('#addr').val();
            text = text.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
            qr.addData(text);
            qr.make();
            img = qr.createImgTag(5);
        }

        var url = 'http://blockchain.info/address/'+addr;
        $('#qr').html('<a href="'+url+'" title="'+addr+'" target="_blank">'+img+'</a>');
        $('#qr_addr').text($('#addr').val());
    }


    function calc_hash() {
        var hash = Crypto.SHA256($('#pass').val(), { asBytes: true });
        $('#hash').val(Crypto.util.bytesToHex(hash));
    }

    function onChangePass() {
        calc_hash();
        clearTimeout(timeout);
        timeout = setTimeout(generate, gen_timeout);
    }

    function onChangeHash() {
        $('#pass').val('');
        gen_ps_reset = true;

        clearTimeout(timeout);

        if (/[^0123456789abcdef]+/i.test($('#hash').val())) {
            setErrorState($('#hash'), true, 'Erroneous characters (must be 0..9-a..f)');
            return;
        } else {
            setErrorState($('#hash'), false);
        }

        timeout = setTimeout(generate, gen_timeout);
    }

    function onChangePrivKey() {

        clearTimeout(timeout);

        $('#pass').val('');
        gen_ps_reset = true;

        var sec = $('#sec').val();

        var res = parseBase58Check(sec);
        var version = res[0];
        var hash = res[1];

        var error = (version != 128 || hash.length != 32);

        if (version == -1) {
            setErrorState($('#sec'), true, 'Invalid private key checksum');
            return;
        } else if (version != 128) {
            setErrorState($('#sec'), true, 'Invalid private key version (must be 128)');
            return;
        } else if (hash.length < 32) {
            setErrorState($('#sec'), true, 'Invalid payload (must be 32 or 33 bytes)');
            return;
        }

        setErrorState($('#sec'), false);

        if (hash.length > 32) {
            hash.pop();

            gen_compressed = true;
            $('#compressed').button('toggle');
        } else {

            gen_compressed = false;
            $('#uncompressed').button('toggle');
        }

        $('#hash').val(Crypto.util.bytesToHex(hash));

        timeout = setTimeout(generate, gen_timeout);
    }

    var from = 'base58';
    var to = 'hex';

    function get_radiobtn_id(obj, def) {
        res = def;
        obj.children().each(function(i) {
            if ($(this).hasClass('active'))
                res = $(this).attr('id');
        });
        return res;
    }

    function update_direction(from, to) {
        $('#direction').html(from + ' &gt; ' + to);
    }

    function update_enc_from() {
        from = $(this).attr('id').substring(5);
        update_direction(from, to);
        translate();
    }

    function update_enc_to() {
        to = $(this).attr('id').substring(3);
        update_direction(from, to);
        translate();
    }

    function strToBytes(str) {
        var bytes = [];
        for (var i = 0; i < str.length; ++i)
           bytes.push(str.charCodeAt(i));
        return bytes;
    }

    function bytesToString(bytes) {
        var str = '';
        for (var i = 0; i < bytes.length; ++i)
            str += String.fromCharCode(bytes[i]);
        return str;
    }

    function translate() {

        var str = $('#from').val();

        text = str;

        bytes = strToBytes(str);

        if (bytes.length > 0) {

            if (from == 'base58') {
                bytes = Bitcoin.Base58.decode(str);
            } else if (from == 'hex') {
                bytes = Crypto.util.hexToBytes(str);
            } else if (from == 'rfc1751') {
                bytes = rfc1751_to_key(str, false);
            }

            if (to == 'base58') {
                text = Bitcoin.Base58.encode(bytes);
            } else if (to == 'hex') {
                text = Crypto.util.bytesToHex(bytes);
            } else if (to == 'text') {
                text = bytesToString(bytes);
            } else if (to == 'rfc1751') {
                text = key_to_rfc1751(bytes, false);
            }

            var bstr = bytes.length + ' ' + (bytes.length == 1 ? 'byte' : 'bytes');

            $('#direction').html(from + '  &gt; ' + bstr + ' &gt; ' + to);

        }

        $('#to').val(text);

    }

    function onChangeFrom() {
        clearTimeout(timeout);
        timeout = setTimeout(translate, gen_timeout);
    }

    function onInput(id, func) {
        $(id).bind("input keyup keydown keypress change blur", function() {
            if ($(this).val() != jQuery.data(this, "lastvalue")) {
                func();
            }
            jQuery.data(this, "lastvalue", $(this).val());
        });
    }

    $(document).ready(
        function() {

            onInput('#pass', onChangePass);
            onInput('#hash', onChangeHash);
            onInput('#sec', onChangePrivKey);

            $('#passphrase').click(update_gen_from);
            $('#secret').click(update_gen_from);
            $('#privkey').click(update_gen_from);
            $('#random').click(gen_random);

            $('#uncompressed').click(update_gen_compressed);
            $('#compressed').click(update_gen_compressed);

            $('#pass').val('correct horse battery staple');
            calc_hash();
            generate();
            $('#pass').focus();

            onInput('#from', onChangeFrom);

            $("body").on("click", "#enc_from .btn", update_enc_from);
            $("body").on("click", "#enc_to .btn", update_enc_to);

            update_direction(from, to);
        }
    );
})(jQuery);
