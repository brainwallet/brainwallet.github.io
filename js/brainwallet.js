(function($){

    var req_count = 2;
    var outof_count = 3;
    var gen_compressed = false;
    var gen_eckey = null;
    var gen_pt = null;
    var gen_ps_reset = false;
    var TIMEOUT = 600;
    var timeout = null;

    var PUBLIC_KEY_VERSION = 0;
    var PRIVATE_KEY_VERSION = 0x80;
    var ADDRESS_URL_PREFIX = 'http://blockchain.info/address/'

    function parseBase58Check(address) {
        var bytes = Bitcoin.Base58.decode(address);
        var end = bytes.length - 4;
        var hash = bytes.slice(0, end);
        var checksum = Crypto.SHA256(Crypto.SHA256(hash, {asBytes: true}), {asBytes: true});
        if (checksum[0] != bytes[end] ||
            checksum[1] != bytes[end+1] ||
            checksum[2] != bytes[end+2] ||
            checksum[3] != bytes[end+3])
                throw new Error("Wrong checksum");
        var version = hash.shift();
        return [version, hash];
    }

    encode_length = function(len) {
        if (len < 0x80)
            return [len];
        else if (len < 255)
            return [0x80|1, len];
        else
            return [0x80|2, len >> 8, len & 0xff];
    }
    
    encode_id = function(id, s) {
        var len = encode_length(s.length);
        return [id].concat(len).concat(s);
    }

    encode_integer = function(s) {
        if (typeof s == 'number')
            s = [s];
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
        for (var i = 0; i < arguments.length; i++)
            sequence = sequence.concat(arguments[i]);
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
        var curve = getSECCurveByName("secp256k1");
        var _p = curve.getCurve().getQ().toByteArrayUnsigned();
        var _r = curve.getN().toByteArrayUnsigned();
        var encoded_oid = [0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x01, 0x01];

        var secret = integerToBytes(eckey.priv, 32);
        var encoded_gxgy = getEncoded(curve.getG(), compressed);
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
        var group = field.closest('.controls');
        if (err) {
            group.addClass('has-error');
            group.attr('title',msg);
        } else {
            group.removeClass('has-error');
            group.attr('title','');
        }
    }

    function reqUpdateLabel() {
      $('#reqMsg').text($('#req_'+req_count).parent().attr('title'));
    }

    function update_req_count() {
        req_count = parseInt($(this).attr('id').substring(4));
        reqUpdateLabel();
        clearTimeout(timeout);
        timeout = setTimeout(generate_redemption_script, TIMEOUT);
    }

    function update_outof() {
        $("#pub1_group").removeClass('hidden');
        $("#pub2_group").removeClass('hidden').addClass((outof_count < 2) ? 'hidden' : '');
        $("#pub3_group").removeClass('hidden').addClass((outof_count < 3) ? 'hidden' : '');
    }

    function outofUpdateLabel() {
      $('#outofMsg').text($('#outof_'+outof_count).parent().attr('title'));
    }

    function update_outof_count() {
        // TODO - this must remain '3' for now, as only M-of-3 multisigs are considered standard right now.
        $("#outof_3").click();
        return;

        outof_count = parseInt($(this).attr('id').substring(6))
        outofUpdateLabel();
        update_outof();
        clearTimeout(timeout);
        timeout = setTimeout(generate_redemption_script, TIMEOUT);
    }

    function generate_redemption_script() {
        var pub1_str = pad($('#pub1').val(), 65, '0');
        var pub1 = Crypto.util.hexToBytes(pub1_str);

        var pub2_str = pad($('#pub2').val(), 65, '0');
        var pub2 = Crypto.util.hexToBytes(pub2_str);

        var pub3_str = pad($('#pub3').val(), 65, '0');
        var pub3 = Crypto.util.hexToBytes(pub3_str);

        var pubkey1 = new Bitcoin.ECKey();
        pubkey1.pub = pub1;
        pubkey1.pubKeyHash = Bitcoin.Util.sha256ripe160(pubkey1.pub);

        var pubkey2 = new Bitcoin.ECKey();
        pubkey2.pub = pub2;
        pubkey2.pubKeyHash = Bitcoin.Util.sha256ripe160(pubkey2.pub);

        var pubkey3 = new Bitcoin.ECKey();
        pubkey3.pub = pub3;
        pubkey3.pubKeyHash = Bitcoin.Util.sha256ripe160(pubkey3.pub);

        // New versions of BitcoinJS-lib have createMultiSigOutputScript, but the one 
        // currently in brainwallet at github doesn't have it, so we must build the
        // script manually.
        var redemption_script = new Bitcoin.Script();

        redemption_script.writeOp([Bitcoin.Opcode.map["OP_1"], Bitcoin.Opcode.map["OP_2"], Bitcoin.Opcode.map["OP_3"]][req_count - 1]);
        
        var pubkeys = new Array(pub1, pub2, pub3);
        for( var i = 0; i < 3 && i < outof_count; i++ ) {
            redemption_script.writeBytes(pubkeys[i]);
        }

        redemption_script.writeOp(Bitcoin.Opcode.map["OP_1"] + (pubkeys.length - 1));
        redemption_script.writeOp(Bitcoin.Opcode.map["OP_CHECKMULTISIG"]);

        var redemption_script_str = Crypto.util.bytesToHex(redemption_script.buffer);
        $("#redemption_script").val(redemption_script_str);

        // Hash the script to produce the bitcoin address:
        var redemptionScriptHash160 = Bitcoin.Util.sha256ripe160(redemption_script.buffer);
        var p2sh_addr = new Bitcoin.Address(redemptionScriptHash160);
        p2sh_addr.version = 5;
        $("#addr").val('' + p2sh_addr);

        var qrCode = qrcode(3, 'M');
        var text = $('#addr').val();
        text = text.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
        qrCode.addData(text);
        qrCode.make();

        $('#genAddrQR').html(qrCode.createImgTag(4));
        $('#genAddrURL').attr('href', ADDRESS_URL_PREFIX+addr);
        $('#genAddrURL').attr('title', addr);
    }

    function onChangePublicKey() {
        clearTimeout(timeout);
        timeout = setTimeout(generate_redemption_script, TIMEOUT);
    }

    function initializePublicKeys() {
        // TODO - support/use compressed pubkeys and make them default
        // TODO - BIP32 and chain-generation (pubkeys can be incremented). provide 3 seeds, increment based on index
        // TODO - "meta" redeemscript (contains the keys) and can be used to seed BIP32 chains
        $('#pub1').val('03d728ad6757d4784effea04d47baafa216cf474866c2d4dc99b1e8e3eb936e730');
        $('#pub2').val('02d83bba35a8022c247b645eed6f81ac41b7c1580de550e7e82c75ad63ee9ac2fd');
        $('#pub3').val('03aeb681df5ac19e449a872b9e9347f1db5a0394d2ec5caf2a9c143f86e232b0d9');
        $('#pub1').focus();
        reqUpdateLabel();
        generate_redemption_script();
    }

    // --- converter ---

    var from = 'hex';
    var to = 'hex';

    function update_enc_from() {
        from = $(this).attr('id').substring(5);
        translate();
    }

    function update_enc_to() {
        to = $(this).attr('id').substring(3);
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

    function isHex(str) {
        return !/[^0123456789abcdef:, ]+/i.test(str);
    }

    function isBase58(str) {
        return !/[^123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+/.test(str);
    }

    function isBase64(str) {
        return !/[^ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=]+/.test(str) && (str.length % 4) == 0;
    }

    function issubset(a, ssv) {
        var b = ssv.trim().split(' ');
        for (var i = 0; i < b.length; i++) {
            if (a.indexOf(b[i].toLowerCase()) == -1 
                && a.indexOf(b[i].toUpperCase()) == -1)
            return false;
        }
        return true;
    }

    function autodetect(str) {
        var enc = [];
        if (isHex(str)) 
            enc.push('hex');
        if (isBase58(str))
            enc.push('base58');
        if (issubset(mn_words, str)) 
            enc.push('mnemonic');
        if (issubset(rfc1751_wordlist, str)) 
            enc.push('rfc1751');
        if (isBase64(str))
            enc.push('base64');
        if (str.length > 0)
            enc.push('text');
        return enc;
    }

    function update_toolbar(enc) {
        var reselect = false;
        $.each($('#enc_from').children(), function() {
            var id = $(this).children().attr('id').substring(5);
            var disabled = (enc && enc.indexOf(id) == -1);
            if (disabled && $(this).hasClass('active')) {
                $(this).removeClass('active');
                reselect = true;
            }
            $(this).attr('disabled', disabled);
        });
        if (enc && enc.length > 0 && reselect) {
            $('#from_' + enc[0]).click();//addClass('active');
            from = enc[0];
        }
    }

    function rot13(str) {
        return str.replace(/[a-zA-Z]/g, function(c) {
          return String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
        });
    }

    function enct(id) {
        return $('#from_'+id).parent().text();
    }

    function translate() {

        var str = $('#src').val();

        if (str.length == 0) {
          update_toolbar(null);
          $('#hint_from').text('');
          $('#hint_to').text('');
          $('#dest').val('');
          return;
        }

        text = str;

        var enc = autodetect(str);

        update_toolbar(enc);

        bytes = strToBytes(str);

        var type = '';

        if (bytes.length > 0) {
            if (from == 'base58') {
                try { 
                    var res = parseBase58Check(str); 
                    type = 'Check ver.' + res[0];
                    bytes = res[1];
                } catch (err) {
                    bytes = Bitcoin.Base58.decode(str);
                }
            } else if (from == 'hex') {
                bytes = Crypto.util.hexToBytes(str.replace(/[ :,]+/g,''));
            } else if (from == 'rfc1751') {
                try { bytes = english_to_key(str); } catch (err) { type = ' ' + err; bytes = []; };
            } else if (from == 'mnemonic') {
                bytes = Crypto.util.hexToBytes(mn_decode(str.trim()));
            } else if (from == 'base64') {
                try { bytes = Crypto.util.base64ToBytes(str); } catch (err) {}
            }

            var ver = '';
            if (to == 'base58') {
                if (bytes.length == 20 || bytes.length == 32) {
                    var addr = new Bitcoin.Address(bytes);
                    addr.version = bytes.length == 32 ? PRIVATE_KEY_VERSION : PUBLIC_KEY_VERSION;
                    text = addr.toString();
                    ver = 'Check ver.' + addr.version;
                } else {
                    text = Bitcoin.Base58.encode(bytes);
                }
            } else if (to == 'hex') {
                text = Crypto.util.bytesToHex(bytes);
            } else if (to == 'text') {
                text = bytesToString(bytes);
            } else if (to == 'rfc1751') {
                text = key_to_english(bytes);
            } else if (to == 'mnemonic') {
                text = mn_encode(Crypto.util.bytesToHex(bytes));
            } else if (to == 'base64') {
                text = Crypto.util.bytesToBase64(bytes);
            } else if (to == 'rot13') {
                text = rot13(str);
            }
        }

        $('#hint_from').text(enct(from) + type + ' (' + bytes.length + ' byte' + (bytes.length == 1 ? ')' : 's)'));
        $('#hint_to').text(enct(to) + ver + ' (' + text.length + ' character' + (text.length == 1 ? ')' : 's)'));
        $('#dest').val(text);
    }

    function onChangeFrom() {
        clearTimeout(timeout);
        timeout = setTimeout(translate, TIMEOUT);
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

    // -- transactions --

    var txType = 'txBCI';
    var txFrom = 'txFromSec';

    function txOnChangeRedemptionScript() {
        var bytes = Crypto.util.hexToBytes($('#txRedemptionScript').val());
        var redemption_script = new Bitcoin.Script(bytes);

        // Hash the script to produce the bitcoin address:
        var redemptionScriptHash160 = Bitcoin.Util.sha256ripe160(redemption_script.buffer);
        var p2sh_addr = new Bitcoin.Address(redemptionScriptHash160);
        p2sh_addr.version = 5;
        $("#txAddr").val('' + p2sh_addr);

        // Show/Hide private key spaces depending on M
        var m = redemption_script.buffer[0] - Bitcoin.Opcode.map["OP_1"] + 1;
        if( m < 1 || m > 3 ) {
            setErrorState($('#txOnChangeRedemptionScript'), true, 'Redemption script is not valid');
            return;
        }

        $("#txSec1_group").removeClass('hidden');
        $("#txSec2_group").removeClass('hidden').addClass((m < 2) ? 'hidden' : '');
        $("#txSec3_group").removeClass('hidden').addClass((m < 3) ? 'hidden' : '');
    }

    function txSetUnspent(text) {
        var r = JSON.parse(text);
        txUnspent = JSON.stringify(r, null, 4);
        $('#txUnspent').val(txUnspent);
        var address = $('#txAddr').val();
        TX.parseInputs(txUnspent, address);
        var value = TX.getBalance();
        var fval = Bitcoin.Util.formatValue(value);
        var fee = parseFloat($('#txFee').val());
        $('#txBalance').val(fval);
        var value = Math.floor((fval-fee)*1e8)/1e8;
        $('#txValue').val(value);
        txRebuild();
    }

    function txUpdateUnspent() {
        txSetUnspent($('#txUnspent').val());
    }

    function txOnChangeUnspent() {
        clearTimeout(timeout);
        timeout = setTimeout(txUpdateUnspent, TIMEOUT);
    }

    function txParseUnspent(text) {
        if (text == '')
            alert('No data');
        txSetUnspent(text);
    }

    function txGetUnspent() {
        var addr = $('#txAddr').val();

        var url = (txType == 'txBCI') ? 'http://blockchain.info/unspent?address=' + addr :
            'http://blockexplorer.com/q/mytransactions/' + addr;

        url = prompt('Press OK to download transaction history:', url);
        if (url != null && url != "") {
            $('#txUnspent').val('');
            tx_fetch(url, txParseUnspent);
        } else {
          txSetUnspent($('#txUnspent').val());
        }
    }

    function txOnChangeJSON() {
        var str = $('#txJSON').val();
        try {
          var sendTx = TX.fromBBE(str);
          $('txJSON').removeClass('has-error');
          var bytes = sendTx.serialize();
          var hex = Crypto.util.bytesToHex(bytes);
          $('#txHex').val(hex);
          setErrorState($('#txJSON'), false, '');
        } catch (err) {
          setErrorState($('#txJSON'), true, 'syntax error');
        }
    }

    function txOnChangeHex() {
        var str = $('#txHex').val();
        str = str.replace(/[^0-9a-fA-f]/g,'');
        $('#txHex').val(str);
        var bytes = Crypto.util.hexToBytes(str);
        var sendTx = TX.deserialize(bytes);
        var text = TX.toBBE(sendTx);
        $('#txJSON').val(text);
    }

    function txOnAddDest() {
        var list = $(document).find('.txCC');
        var clone = list.last().clone();
        clone.find('.help-inline').empty();
        clone.find('.control-label').text('Cc');
        var dest = clone.find('#txDest');
        var value = clone.find('#txValue');
        clone.insertAfter(list.last());
        onInput(dest, txOnChangeDest);
        onInput(value, txOnChangeDest);
        dest.val('');
        value.val('');
        $('#txRemoveDest').attr('disabled', false);
        return false;
    }

    function txOnRemoveDest() {
        var list = $(document).find('.txCC');
        if (list.size() == 2)
            $('#txRemoveDest').attr('disabled', true);
        list.last().remove();
        return false;
    }

    function txSent(text) {
        alert(text ? text : 'No response!');
    }

    function txSend() {
        var r = '';
        var tx = $('#txHex').val();

        // Disabled for now because Blockchain.info can't verify
        // signatures on these transactions properly yet.
        alert("Since Blockchain.info cannot correctly verify the signatures in a multi-signature transaction correctly yet, pushing is disabled. In order to broadcast this transaction, you need to use another service.  Bitcoind/Bitcoin-Qt are known to work.");
        return;

        //url = 'http://bitsend.rowit.co.uk/?transaction=' + tx;
        url = 'http://blockchain.info/pushtx';
        postdata = 'tx=' + tx;
        url = prompt(r + 'Press OK to send transaction to:', url);
        if (url != null && url != "") {
            tx_fetch(url, txSent, txSent, postdata);
        }
        return false;
    }

    function txKey(i) {
        var sec = $('#txSec' + i).val();
        try {
            var res = parseBase58Check(sec); 
            var version = res[0];
            var payload = res[1];
        } catch (err) {
            return null;
        }

        var compressed = false;
        if (payload.length > 32) {
            payload.pop();
            compressed = true;
        }

        var eckey = new Bitcoin.ECKey(payload);
        eckey.setCompressed(compressed);
        return eckey;
    }

    function txRebuild() {
        var bytes = Crypto.util.hexToBytes($('#txRedemptionScript').val());
        var redemption_script = new Bitcoin.Script(bytes);
        var m = redemption_script.buffer[0] - Bitcoin.Opcode.map["OP_1"] + 1;

        var eckey1 = (m >= 1) ? txKey(1) : null;
        var eckey2 = (m >= 2) ? txKey(2) : null;
        var eckey3 = (m >= 3) ? txKey(3) : null;

        if( (m >= 3 && (eckey3 == null || eckey2 == null || eckey1 == null))
           || (m >= 2 && (eckey2 == null || eckey1 == null))
           || (m >= 1 && (eckey1 == null)) ) {
            $('#txJSON').val('');
            $('#txHex').val('');
            return;
        }

        var eckeys = new Array();
        if( m >= 1 )
            eckeys.push(eckey1);
        if( m >= 2 )
            eckeys.push(eckey2);
        if( m >= 3 )
            eckeys.push(eckey3);

        var addr = $('#txAddr').val();
        var unspent = $('#txUnspent').val();
        var balance = parseFloat($('#txBalance').val());
        var fee = parseFloat('0'+$('#txFee').val());

        TX.init(eckeys, redemption_script);

        var fval = 0;
        var o = txGetOutputs();
        for (i in o) {
            TX.addOutput(o[i].dest, o[i].fval);
            fval += o[i].fval;
        }

        // send change back or it will be sent as fee
        // Current BitcoinJS won't let us return the change to ourselves.
        // It throwns an exception in Bitcoin.Address.decodeString complaining about "Version 5" addresses.
        // if (balance > fval + fee) {
        //     var change = balance - fval - fee;
        //     TX.addOutput(addr, change);
        // }

        try {
            var sendTx = TX.construct();
            var txJSON = TX.toBBE(sendTx);
            var buf = sendTx.serialize();
            var txHex = Crypto.util.bytesToHex(buf);
            setErrorState($('#txJSON'), false, '');
            $('#txJSON').val(txJSON);
            $('#txHex').val(txHex);
        } catch(err) {
            if( ('' + err) == 'Version 5 not supported!' ) {
                alert("The current version of BitcoinJS does not support spending to P2SH addresses yet.")
            }
            $('#txJSON').val('');
            $('#txHex').val('');
        }
    }

    function txSign() {
        if (txFrom=='txFromSec')
        {
            txRebuild();
            return;
        }

        var str = $('#txJSON').val();
        TX.removeOutputs();
        var sendTx = TX.fromBBE(str);

        try {
            sendTx = TX.resign(sendTx);
            $('#txJSON').val(TX.toBBE(sendTx));
            $('#txHex').val(Crypto.util.bytesToHex(sendTx.serialize()));
            $('#txFee').val(Bitcoin.Util.formatValue(TX.getFee(sendTx)));
        } catch(err) {
            $('#txJSON').val('');
            $('#txHex').val('');
        }
    }

    function txOnChangeDest() {
        var balance = parseFloat($('#txBalance').val());
        var fval = parseFloat('0'+$('#txValue').val());
        var fee = parseFloat('0'+$('#txFee').val());

        if (fval + fee > balance) {
            fee = balance - fval;
            $('#txFee').val(fee > 0 ? fee : '0.00');
        }

        clearTimeout(timeout);
        timeout = setTimeout(txRebuild, TIMEOUT);
    }

    function txShowUnspent() {
        var div = $('#txUnspentForm');

        if (div.hasClass('hide')) {
            div.removeClass('hide');
            $('#txShowUnspent').text('Hide Outputs');
        } else {
            div.addClass('hide');
            $('#txShowUnspent').text('Show Outputs');
        }
    }

    function txChangeType() {
        txType = $(this).attr('id');
    }

    function txOnChangeFee() {

        var balance = parseFloat($('#txBalance').val());
        var fee = parseFloat('0'+$('#txFee').val());

        var fval = 0;
        var o = txGetOutputs();
        for (i in o) {
            TX.addOutput(o[i].dest, o[i].fval);
            fval += o[i].fval;
        }

        if (fval + fee > balance) {
            fval = balance - fee;
            $('#txValue').val(fval < 0 ? 0 : fval);
        }

        if (fee == 0 && fval == balance - 0.0005) {
            $('#txValue').val(balance);
        }

        clearTimeout(timeout);
        timeout = setTimeout(txRebuild, TIMEOUT);
    }

    function txGetOutputs() {
        var res = [];
        $.each($(document).find('.txCC'), function() {
            var dest = $(this).find('#txDest').val();
            var fval = parseFloat('0' + $(this).find('#txValue').val());
            res.push( {"dest":dest, "fval":fval } );
        });
        return res;
    }

    function crChange()
    {
      PUBLIC_KEY_VERSION = parseInt($(this).attr('title'));
      PRIVATE_KEY_VERSION = (PUBLIC_KEY_VERSION+128)&255;
      ADDRESS_URL_PREFIX = $(this).attr('href');
      $('#crName').text($(this).text());
      $('#crSelect').dropdown('toggle');
      translate();
      return false;
    }

    $(document).ready( function() {

        if (window.location.hash)
          $('#tab-' + window.location.hash.substr(1).split('?')[0]).tab('show');

        $('a[data-toggle="tab"]').on('click', function (e) {
            window.location.hash = $(this).attr('href');
        });

        // generator

        onInput('#pub1', onChangePublicKey);
        onInput('#pub2', onChangePublicKey);
        onInput('#pub3', onChangePublicKey);

        $('#req_count label input').on('change', update_req_count );
        $('#outof_count label input').on('change', update_outof_count );

        initializePublicKeys();
        reqUpdateLabel();
        outofUpdateLabel();

        // transactions

        $("#txRedemptionScript").val('522103d728ad6757d4784effea04d47baafa216cf474866c2d4dc99b1e8e3eb936e7302102d83bba35a8022c247b645eed6f81ac41b7c1580de550e7e82c75ad63ee9ac2fd2103aeb681df5ac19e449a872b9e9347f1db5a0394d2ec5caf2a9c143f86e232b0d953ae');
        txOnChangeRedemptionScript();

        $("#txSec1").val('KybuecAGpGhfLP4y6bd6bidFn23dGK2EJJi8zvbwjoffYd14EsU6');
        $("#txSec2").val('L11z9LhtCJmPPtK4cwMC4s9s9R3uXkuPkmGfjBmUGGHn7eFejiPC');
        $("#txSec3").val('L1idoWSvtirHZgYU5eVFGHSHG9xXB72AyLSupfQrs6JUvUAPSKzS');

        $('#txDest').val(tx_dest);

        txSetUnspent(tx_unspent);

        $('#txGetUnspent').click(txGetUnspent);
        $('#txType label input').on('change', txChangeType);

        onInput($('#txRedemptionScript'), txOnChangeRedemptionScript);
        onInput($('#txUnspent'), txOnChangeUnspent);
        onInput($('#txHex'), txOnChangeHex);
        onInput($('#txJSON'), txOnChangeJSON);
        onInput($('#txDest'), txOnChangeDest);
        onInput($('#txValue'), txOnChangeDest);
        onInput($('#txFee'), txOnChangeFee);

        $('#txAddDest').click(txOnAddDest);
        $('#txRemoveDest').click(txOnRemoveDest);
        $('#txSend').click(txSend);
        $('#txSign').click(txSign);

        // converter

        onInput('#src', onChangeFrom);

        $('#enc_from label input').on('change', update_enc_from );
        $('#enc_to label input').on('change', update_enc_to );

        // currency select

        $('#crCurrency ul li a').on('click', crChange);

    });
})(jQuery);
