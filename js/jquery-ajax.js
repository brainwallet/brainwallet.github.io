// This is modified jquery.xdomainajax.js plugin
// see https://github.com/padolsey-archive/jquery.fn/tree/master/cross-domain-ajax
// can't invoke fail() handler yet (YQL doesn't throw errors), returns ether '' or '{}'.

jQuery.ajax = (function(_ajax){

    var protocol = location.protocol,
        hostname = location.hostname,
        exRegex = RegExp(protocol + '//' + hostname),
        YQL = 'http' + (/^https/.test(protocol)?'s':'') + '://query.yahooapis.com/v1/public/yql',
        query = 'select * from html where url="{URL}"';

    function isExternal(url) {
        return !exRegex.test(url) && /:\/\//.test(url);
    }

    return function(o) {

        if ( /get/i.test(o.type) || /post/i.test(o.type) ) {

            var url = o.url;

            var bPost = /post/i.test(o.type);
            var bJson = /json/i.test(o.dataType);

            o.url = YQL;
            delete(o.dataType);

            if (bPost)
                query = 'use "https://brainwallet.github.io/js/htmlpost.xml" as htmlpost;'
                  + ' select * from htmlpost where url="{URL}"'
                  + ' and postdata="{POSTDATA}" and xpath="/"';

            var postdata = bPost && o.data ? jQuery.param(o.data): '';
            var q = query.replace('{URL}', url).replace('{POSTDATA}',postdata);
            o.data = { q: q, format: 'xml' };

            if (!o.success && o.complete) {
                o.success = o.complete;
                delete o.complete;
            }

            o.success = (function(_success) {
                return function(data) {
                    if (_success) {
                        var text = $(data).find('results').text();
                        _success.call(this,
                         bJson ? ( text!='' ? JSON.parse(text) : {} ) : ( { responseText: text } )
                        , 'success' );
                    }
                };
            })(o.success);
        }

        return _ajax.apply(this, arguments);
    };

})(jQuery.ajax);
