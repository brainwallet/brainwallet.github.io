This is from the authors

Brainwallet (new currency added)
===========

JavaScript Client-Side Bitcoin Address Generator

Notable features
----------------

* Online converter, including Base58 decoder and encoder
* OpenSSL point conversion and compressed keys support
* Armory and Electrum deterministic wallets implementation
* RFC 1751 JavaScript implementation
* Bitcoin transactions editor
* Signing and verifying messages with bitcoin address
* Litecoin support

Newly added for supporting new wallets

How to check out the wallet format? Why not try to read base58.h of each wallets yourself? The author also read it in detail and tested carefully before putting in.

I have faced some issues, For example wallet cannot be imported in.
There are some reasons 
First reason, I don't have the private key. If you don't have one, then get lost!

Second Reason, If you have private key, then is it encrypted? If encrypted, then do you know the passparase required to decode? If you don't then get lost!

Third Reason, You have the private key, you also know the private key points to that address, unencrypted, uncompressed, you know tool used. Which is close to my case I have been facing. I think the private key represents wrongly, because it is in 0x80 language, then if using the thing, Then I can try to solve it as It is right.



Majority of wallets follow 0x80(128 in common term) shifting rule for private key use so it is considered as standard tool with different concept such as skating,something called chain proofing and son on.

There are some builds for private key part like Clamcoin, they have another set of swifting rules for private key which I need to study further, not public key part so You have to write the ECDSA data to keep trying to tune the representation right. 

The client follows the 0x80 rule, so it proably save me from trouble as base58 representation can be anything 

For supporting or contribution, Wouldn't you like to send me some coins to one of the following?
BTC: 12NSwGU28CQYJQjXPKE1B7A95cemHJYamG
RDD: Rajp8io1HyXav18ZbSBF3Hj2neoEHhsUJP

konysulphrea
20 April 2015



