/*
    tx.js - constructing bitcoin transactions using pure js (public domain)

    I. Constructing transactions

    To make a working transaction you have to know the following:

    1) Exact hash of the transaction that was used for transferring funds;
    2) exact script used for that (scriptPubKey, aka connectedScript);
    3) exact outpoint index (position in the list of tx_outs);
    4) and (highly desirable) the exact value used in this outpoint.

    Additionally, you have to make sure those outputs weren't already spent.

    Unspent outputs may be obtained from:

    1) http://blockchain.info/unspent?address=<address>
    2) http://blockexplorer.com/q/mytransactions/<address>

    (The latter needs parser made by BTCurious.)

    Signing uses random nonce, so don't afraid your signatures are changing.

    Signing process (by justmoon):

    This is one of the most complicated parts of Bitcoin imho. The data
    that is signed is a double-SHA256 hash of a specially serialized
    version of the transaction.

    First, the transaction is copied. The input being signed is replaced
    with the scriptPubKey of the corresponding txout.

    With the default hashType SIGHASH_ALL, we're done now. But for the other
    hashTypes SIGHASH_NONE and SIGHASH_SINGLE as well as the
    SIGHASH_ANYONECANPAY flag, some more steps are needed. See the function
    SignatureHash in script.cpp for details.

    After that, the transaction is serialized and the hashType is appended as a
    single byte, followed by three zero bytes, e.g. 01000000.

    Then Bitcoin calculates the double SHA256 of that and signs the resulting
    hash.

    II. Sending transactions

    There are a few sites that allow sending raw transactions:

    1) http://bitsend.rowit.co.uk

    This site allows you to paste a raw transaction in hex (i.e. characters
    0-9, a-f) this will then be checked it is valid and transmitted over the
    network. Donations: 13Tn1QkAcqnQvGA7kBiCBH7NbijNcr6GMs (0.05 recommended 
    per transaction :) )

    2) http://www.blockchain.info/pushtx

    This page allows you to paste a raw transaction in hex (i.e. characters
    0-9, a-f) this will then be checked it is valid and transmitted over the
    network. All transactions must include a minimum 0.005 BTC fee to
    blockchain.info: 1A8JiWcwvpY7tAopUkSnGuEYHmzGYfZPiq

*/

var TX = new function () {

    var inputs = [];
    var outputs = [];
    var eckey = null;
    var balance = 0;

    this.init = function(_eckey) {
        outputs = [];
        eckey = _eckey;
    }

    this.addOutput = function(addr, fval) {
        outputs.push({address: addr, value: fval});
    }

    this.getBalance = function() {
        return new BigInteger(''+balance, 10);
    }

    this.parseInputs = function(text, address) {
        try {
            var res = tx_parseBCI(text, address);
        } catch(err) {
            var res = parseTxs(text, address);
        }

        balance = res.balance;
        inputs = res.unspenttxs;
    }

    this.construct = function() {
        var sendTx = new Bitcoin.Transaction();
        var selectedOuts = [];
        for (var hash in inputs) {
            if (!inputs.hasOwnProperty(hash))
                continue;
            for (var index in inputs[hash]) {
                if (!inputs[hash].hasOwnProperty(index))
                    continue;
                var script = parseScript(inputs[hash][index].script);
                var b64hash = Crypto.util.bytesToBase64(Crypto.util.hexToBytes(hash));
                var txin = new Bitcoin.TransactionIn({outpoint: {hash: b64hash, index: index}, script: script, sequence: 4294967295});
                selectedOuts.push(txin);
                sendTx.addInput(txin);
            }
        }

        for (var i in outputs) {
            var address = outputs[i].address;
            var fval = outputs[i].value;
            var value = new BigInteger('' + Math.floor(fval * 1e8), 10);
            sendTx.addOutput(new Bitcoin.Address(address), value);
        }

        var hashType = 1;
        for (var i = 0; i < sendTx.ins.length; i++) {
            var connectedScript = selectedOuts[i].script;
            var hash = sendTx.hashTransactionForSignature(connectedScript, i, hashType);
            var pubKeyHash = connectedScript.simpleOutPubKeyHash();
            var signature = eckey.sign(hash);
            signature.push(parseInt(hashType, 10));
            var pubKey = eckey.getPub();
            var script = new Bitcoin.Script();
            script.writeBytes(signature);
            script.writeBytes(pubKey);
            sendTx.ins[i].script = script;
        }
        return sendTx;
    };

    function uint(f, size) {
        if (f.length < size)
            return 0;
        var bytes = f.slice(0, size);
        var pos = 1;
        var n = 0;
        for (var i = 0; i < size; i++) { 
            var b = f.shift();
            n += b * pos;
            pos *= 256;
        }
        return size <= 4 ? n : bytes;
    }

    function u8(f)  { return uint(f,1); }
    function u16(f) { return uint(f,2); }
    function u32(f) { return uint(f,4); }
    function u64(f) { return uint(f,8); }

    function errv(val) {
        return (val instanceof BigInteger || val > 0xffff);
    }

    function readBuffer(f, size) {
        var res = f.slice(0, size);
        for (var i = 0; i < size; i++) f.shift();
        return res;
    }

    function readString(f) {
        var len = readVarInt(f);
        if (errv(len)) return [];
        return readBuffer(f, len);
    }

    function readVarInt(f) {
        var t = u8(f);
        if (t == 0xfd) return u16(f); else
        if (t == 0xfe) return u32(f); else
        if (t == 0xff) return u64(f); else
        return t;
    }

    this.deserialize = function(bytes) {
        var sendTx = new Bitcoin.Transaction();

        var f = bytes.slice(0);
        var tx_ver = u32(f);
        var vin_sz = readVarInt(f);
        if (errv(vin_sz))
            return null;

        for (var i = 0; i < vin_sz; i++) {
            var op = readBuffer(f, 32);
            var n = u32(f);
            var script = readString(f);
            var seq = u32(f);
            var txin = new Bitcoin.TransactionIn({
                outpoint: { 
                    hash: Crypto.util.bytesToBase64(op),
                    index: n
                },
                script: new Bitcoin.Script(script),
                sequence: seq
            });
            sendTx.addInput(txin);
        }

        var vout_sz = readVarInt(f);

        if (errv(vout_sz))
            return null;

        for (var i = 0; i < vout_sz; i++) {
            var value = u64(f);
            var script = readString(f);

            var txout = new Bitcoin.TransactionOut({
                value: value,
                script: new Bitcoin.Script(script)
            });

            sendTx.addOutput(txout);
        }
        var lock_time = u32(f);
        sendTx.lock_time = lock_time;
        return sendTx;
    };

    this.toBBE = function(sendTx) {
        //serialize to Bitcoin Block Explorer format
        var buf = sendTx.serialize();
        var hash = Crypto.SHA256(Crypto.SHA256(buf, {asBytes: true}), {asBytes: true});

        var r = {};
        r['hash'] = Crypto.util.bytesToHex(hash.reverse());
        r['ver'] = sendTx.version;
        r['vin_sz'] = sendTx.ins.length;
        r['vout_sz'] = sendTx.outs.length;
        r['lock_time'] = sendTx.lock_time;
        r['size'] = buf.length;
        r['in'] = []
        r['out'] = []

        for (var i = 0; i < sendTx.ins.length; i++) {
            var txin = sendTx.ins[i];
            var hash = Crypto.util.base64ToBytes(txin.outpoint.hash);
            var n = txin.outpoint.index;
            var prev_out = {'hash': Crypto.util.bytesToHex(hash.reverse()), 'n': n};

            if (n == 4294967295) {
                var cb = Crypto.util.bytesToHex(txin.script.buffer);
                r['in'].push({'prev_out': prev_out, 'coinbase' : cb});
            } else {
                var ss = dumpScript(txin.script);
                r['in'].push({'prev_out': prev_out, 'scriptSig' : ss});
            }
        }

        for (var i = 0; i < sendTx.outs.length; i++) {
            var txout = sendTx.outs[i];
            var bytes = txout.value.slice(0);
            var fval = parseFloat(Bitcoin.Util.formatValue(bytes.reverse()));
            var value = fval.toFixed(8);
            var spk = dumpScript(txout.script);
            r['out'].push({'value' : value, 'scriptPubKey': spk});
        }

        return JSON.stringify(r, null, 4);
    };

    function parseScript(str) {
        if (!str)
            return [];
        var chunks = str.split(' ');
        var script = new Bitcoin.Script();
        for (var i = 0; i < chunks.length; i++) {
            var chunk = chunks[i];
            if (chunk.indexOf('OP_') != -1)
                script.writeOp(Bitcoin.Opcode.map[chunk]);
            else
                script.writeBytes(Crypto.util.hexToBytes(chunk));
        }
        return script;
    }

    this.fromBBE = function(text) {
        //deserialize from Bitcoin Block Explorer format
        var sendTx = new Bitcoin.Transaction();
        var r = jQuery.parseJSON(text);
        if (!r)
            return sendTx;
        var tx_ver = r['ver'];
        var vin_sz = r['vin_sz'];

        for (var i = 0; i < vin_sz; i++) {
            var txi = r['in'][i];
            var hash = Crypto.util.hexToBytes(txi['prev_out']['hash']);
            var n = txi['prev_out']['n'];

            if (txi['coinbase'])
                var script = Crypto.util.hexToBytes(txi['coinbase']);
            else
                var script = parseScript(txi['scriptSig']);

            var txin = new Bitcoin.TransactionIn({
                outpoint: { 
                    hash: Crypto.util.bytesToBase64(hash.reverse()),
                    index: n
                },
                script: new Bitcoin.Script(script),
                sequence: 4294967295
            });
            sendTx.addInput(txin);
        }

        var vout_sz = r['vout_sz'];

        for (var i = 0; i < vout_sz; i++) {
            var txo = r['out'][i];
            var fval = parseFloat(txo['value']);
            var value = new BigInteger('' + Math.floor(fval * 1e8), 10);
            var script = parseScript(txo['scriptPubKey']);

            if (value instanceof BigInteger) {
                value = value.toByteArrayUnsigned().reverse();
                while (value.length < 8) value.push(0);
            }

            var txout = new Bitcoin.TransactionOut({
                value: value,
                script: new Bitcoin.Script(script)
            });

            sendTx.addOutput(txout);
        }
        sendTx.lock_time = r['lock_time'];
        return sendTx;
    };
    return this;
};

function dumpScript(script) {
    var out = [];
    for (var i = 0; i < script.chunks.length; i++) {
        var chunk = script.chunks[i];
        var op = new Bitcoin.Opcode(chunk);
        typeof chunk == 'number' ?  out.push(op.toString()) :
            out.push(Crypto.util.bytesToHex(chunk));
    }
    return out.join(' ');
}

//blockchain.info parser (adapted)

function tx_parseBCI(data, address) {
    var r = jQuery.parseJSON(data);
    var txs = r.unspent_outputs;

    if (!txs)
        throw 'Not a BCI format';

    delete unspenttxs;
    var unspenttxs = {};
    var balance = BigInteger.ZERO;
    for (var i in txs) {
        var o = txs[i];

        //use plain hex-encoded hash
        var lilendHash = o.tx_hash;

        //convert script back to BBE-compatible text
        var script = dumpScript( new Bitcoin.Script(Crypto.util.hexToBytes(o.script)) );

        var value = new BigInteger('' + o.value, 10);
        if (!(lilendHash in unspenttxs))
            unspenttxs[lilendHash] = {};

        unspenttxs[lilendHash][i] = {amount: value, script: script};

        balance = balance.add(value);
    }
    return {balance:balance, unspenttxs:unspenttxs};
}

//--->8---
// blockexplorer parser (by BTCurious)
function parseTxs(data, address) {

    var address = address.toString();
    var tmp = JSON.parse(data);
    var txs = [];
    for (var a in tmp) {
        if (!tmp.hasOwnProperty(a))
            continue;
        txs.push(tmp[a]);
    }
    
    // Sort chronologically
    txs.sort(function(a,b) {
        if (a.time > b.time) return 1;
        else if (a.time < b.time) return -1;
        return 0;
    })

    delete unspenttxs;
    var unspenttxs = {}; // { "<hash>": { <output index>: { amount:<amount>, script:<script> }}}

    var balance = BigInteger.ZERO;

    // Enumerate the transactions 
    for (var a in txs) {
    
        if (!txs.hasOwnProperty(a))
            continue;
        var tx = txs[a];
        if (tx.ver != 1) throw "Unknown version found. Expected version 1, found version "+tx.ver;
        
        // Enumerate inputs
        for (var b in tx.in ) {
            if (!tx.in.hasOwnProperty(b))
                continue;
            var input = tx.in[b];
            var p = input.prev_out;
            var lilendHash = endian(p.hash)
            // if this came from a transaction to our address...
            if (lilendHash in unspenttxs) {
                unspenttx = unspenttxs[lilendHash];
                
                // remove from unspent transactions, and deduce the amount from the balance
                balance = balance.subtract(unspenttx[p.n].amount);
                delete unspenttx[p.n]
                if (isEmpty(unspenttx)) {
                    delete unspenttxs[lilendHash]
                }
            }
        }
        
        // Enumerate outputs
        var i = 0;
        for (var b in tx.out) {
            if (!tx.out.hasOwnProperty(b))
                continue;
                
            var output = tx.out[b];

            // if this was sent to our address...
            if (output.address == address) {
                // remember the transaction, index, amount, and script, and add the amount to the wallet balance
                var value = btcstr2bignum(output.value);
                var lilendHash = endian(tx.hash)
                if (!(lilendHash in unspenttxs))
                    unspenttxs[lilendHash] = {};
                unspenttxs[lilendHash][i] = {amount: value, script: output.scriptPubKey};
                balance = balance.add(value);
            }
            i = i + 1;
        }
    }

    return {balance:balance, unspenttxs:unspenttxs};
}

function isEmpty(ob) {
    for(var i in ob){ if(ob.hasOwnProperty(i)){return false;}}
    return true;
}

function endian(string) {
    var out = []
    for(var i = string.length; i > 0; i-=2) {
        out.push(string.substring(i-2,i));
    }
    return out.join("");
}

function btcstr2bignum(btc) {
    var i = btc.indexOf('.');
    var value = new BigInteger(btc.replace(/\./,''));
    var diff = 9 - (btc.length - i);
    if (i == -1) {
        var mul = "100000000";
    } else if (diff < 0) {
        return value.divide(new BigInteger(Math.pow(10,-1*diff).toString()));
    } else {
        var mul = Math.pow(10,diff).toString();
    }
    return value.multiply(new BigInteger(mul));
}
// --->8---

function tx_fetch(url, onSuccess, onError) {
    //some cross-domain magic (to bypass Access-Control-Allow-Origin)
    //tx_fetch('http://blockchain.info/unspent?address=' + addr, ... );
    var useYQL = true;
    $.ajax({
        url: useYQL ? 'https://query.yahooapis.com/v1/public/yql?q=' + encodeURIComponent('select * from html where url="'+url+'"') : url,
        success: function(res) {
            onSuccess(useYQL ? $(res).find('results').text() : res.responseText);
        },
        error:function (xhr, opt, err) {
            if (onError)
                onError(err);
        }
    });
}

var tx_sec = '5KdttCmkLPPLN4oDet53FBdPxp4N1DWoGCiigd3ES9Wuknhm8uT';
var tx_addr = '12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX';
var tx_dest = '15ArtCgi3wmpQAAfYx4riaFmo4prJA4VsK';
var tx_unspent = '{"unspent_outputs":[{"tx_hash":"7a06ea98cd40ba2e3288262b28638cec5337c1456aaf5eedc8e9e5a20f062bdf","tx_index":5,"tx_output_n": 0,"script":"4104184f32b212815c6e522e66686324030ff7e5bf08efb21f8b00614fb7690e19131dd31304c54f37baa40db231c918106bb9fd43373e37ae31a0befc6ecaefb867ac","value": 5000000000,"value_hex": "012a05f200","confirmations":177254}]}';

function tx_test() {
    var bytes = Bitcoin.Base58.decode(tx_sec);
    var eckey = new Bitcoin.ECKey(bytes.slice(1, 33));

    TX.init(eckey);

    TX.parseInputs(tx_unspent);
    TX.addOutput(tx_dest, 50 * 1e8);

    var sendTx = TX.construct();

    console.log( TX.toBBE(sendTx) );
    console.log( Crypto.util.bytesToHex(sendTx.serialize()));
}

