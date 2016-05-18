'use strict';

var Marionette = require('../shims/marionette.js'),
  $ = require('jquery'),
  _ = require('underscore'),
  Assembl = require('../app.js'),
  Ctx = require('../common/context.js'),
  CollectionManager = require('../common/collectionManager.js'),
  Types = require('../utils/types.js'),
  BreadCrumbView = require('./breadcrumb.js'),
  CKEditorField = require('./reusableDataFields/ckeditorField.js'),
  IdeaModel = require('../models/idea.js'),
  i18n = require('../utils/i18n.js'),
  openIdeaInModal = require('./modals/ideaInModal.js');


// from http://stackoverflow.com/questions/3959211/fast-factorial-function-in-javascript
// The factorial mathematical function: it computes num! ("num factorial")
function sFact(num)
{
  var rval=1;
  for (var i = 2; i <= num; i++)
    rval = rval * i;
  return rval;
}

// from http://stackoverflow.com/a/24257996/2136130
function nthPermutation(atoms, index, size) {
  var src = atoms.slice(), dest = [], item;
  for (var i = 0; i < size; i++) {
    item = index % src.length;
    index = Math.floor(index / src.length);
    dest.push(src[item]);
    src.splice(item, 1);
  }
  return dest;
}

/*
// NOT USED YET
// Returned array will contain alternatively one element from the beginning of the array, and one from the end (the second element of the returned array will be the last from the input array if the array size is odd, or the penultimate if the array size is pair)
function alternateItems(atoms, size){
  var dest = atoms.slice(); // copy array
  var offset = (n % 2 == 0) ? -1 : 0;
  for ( var i = 1; i < size; i += 2 ){
    dest[i] = atoms[size - 1 + offset];
  }
  return dest;
}
*/

// Returns the index in the array, as if the array was alternated: the array would contain alternatively one element from the beginning of the array, and one from the end (the second element of the returned array will be the last from the input array if the array size is odd, or the penultimate if the array size is pair)
function alternatedIndex(index, size){
  if ( index % 2 == 0 ){
    return index;
  }
  else {
    var offset = (size % 2 == 0) ? -1 : 0;
    return size - 1 + offset;
  }
}

/*
// NOT USED YET
// Get the linear interpolation between two values
var lerp = function (value1, value2, amount) {
  amount = amount < 0 ? 0 : amount;
  amount = amount > 1 ? 1 : amount;
  return value1 + (value2 - value1) * amount;
}
*/

// Icon of an "zero"/empty token := By clicking on it, the user sets 0 tokens on this idea
// path.outer is the outer circle, and path.inner is the inner disk. They get stylized differently using CSS depending on the icon's CSS hover state.
var zeroFullTokenIcon = $('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" style="width: 20px; height: 20px;" xml:space="preserve" aria-hidden="true" role="img" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:svg="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="20px" height="20px" viewBox="0 0 20 20" version="1.1" inkscape:version="0.48.4 r9939" sodipodi:docname="token_zero.svg"> <metadata id="metadata22"> <rdf:RDF> <cc:Work rdf:about=""> <dc:format>image/svg+xml</dc:format> <dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage" /> </cc:Work> </rdf:RDF> </metadata> <sodipodi:namedview pagecolor="#ffffff" bordercolor="#666666" borderopacity="1" objecttolerance="10" gridtolerance="10" guidetolerance="10" inkscape:pageopacity="0" inkscape:pageshadow="2" inkscape:window-width="1541" inkscape:window-height="876" id="namedview20" showgrid="false" inkscape:zoom="23.6" inkscape:cx="5.5729235" inkscape:cy="10.96989" inkscape:window-x="59" inkscape:window-y="24" inkscape:window-maximized="1" inkscape:current-layer="svg2" /> <path class="outer" sodipodi:type="arc" fill="none" stroke="#000000" stroke-width="1" stroke-miterlimit="4" stroke-opacity="1" stroke-dasharray="none" id="path2999" sodipodi:cx="9.3644066" sodipodi:cy="11.271187" sodipodi:rx="6.2288136" sodipodi:ry="6.3559322" d="m 15.59322,11.271187 a 6.2288136,6.3559322 0 1 1 -12.4576271,0 6.2288136,6.3559322 0 1 1 12.4576271,0 z" transform="matrix(1.4872568,0,0,1.4575117,-3.9272774,-6.4278868)" /> <path class="inner" sodipodi:type="arc" fill:"#000000" fill-opacity="1" stroke="none" id="path2999-6" sodipodi:cx="9.3644066" sodipodi:cy="11.271187" sodipodi:rx="6.2288136" sodipodi:ry="6.3559322" d="m 15.59322,11.271187 a 6.2288136,6.3559322 0 1 1 -12.4576271,0 6.2288136,6.3559322 0 1 1 12.4576271,0 z" transform="matrix(0.80272108,0,0,0.78666666,2.4829934,1.133333)" /></svg>');

// Icon of a token := There will be maximum_per_idea of them shown per votable idea. By clicking on one of them, the user sets as many tokens on the idea
var oneFullTokenIcon = $('<a class="btn"><svg viewBox="0 0 20 20" style="width: 20px; height: 20px;"><path fill="#4691f6" d="M9.917,0.875c-5.086,0-9.208,4.123-9.208,9.208c0,5.086,4.123,9.208,9.208,9.208s9.208-4.122,9.208-9.208 C19.125,4.998,15.003,0.875,9.917,0.875z M9.917,18.141c-4.451,0-8.058-3.607-8.058-8.058s3.607-8.057,8.058-8.057 c4.449,0,8.057,3.607,8.057,8.057S14.366,18.141,9.917,18.141z M13.851,6.794l-5.373,5.372L5.984,9.672 c-0.219-0.219-0.575-0.219-0.795,0c-0.219,0.22-0.219,0.575,0,0.794l2.823,2.823c0.02,0.028,0.031,0.059,0.055,0.083 c0.113,0.113,0.263,0.166,0.411,0.162c0.148,0.004,0.298-0.049,0.411-0.162c0.024-0.024,0.036-0.055,0.055-0.083l5.701-5.7 c0.219-0.219,0.219-0.575,0-0.794C14.425,6.575,14.069,6.575,13.851,6.794z"></path></svg></a>');


/*
Adding CSS to an SVG which has been embedded using an <image> tag is not possible, nor with a background CSS property.
Adding CSS to an external SVG which has been embedded using an <object> tag is possible only if the URL is on the same domain (CORS policy).
So we have to GET the SVG file from its URL with an AJAX call, and add it inline to the DOM.
*/
var _ajaxCache = {};
var getSVGElementByURLPromise = function(url){
  if ( url in _ajaxCache ){
    return _ajaxCache[url];
  }
  var success = function(data){
    var svg = $(data).find('svg');
    svg.removeAttr('xmlns:a');
    svg.attr("aria-hidden", "true");
    svg.attr("role", "img");
    if (!svg.attr("viewBox")){
      svg.attr("viewBox","0 0 100 100");
    }
    return svg;
  };

  var failure = function(){
    return success(oneFullTokenIcon);
  };

  _ajaxCache[url] = $.ajax({
    url: url,
    dataType: 'xml'
  }).then(success, failure);
  return _ajaxCache[url];
};

var getTokenSize = function(number_of_tokens, maximum_tokens_per_row, maximum_total_width){
  var token_size = 35;
  maximum_total_width = maximum_total_width ? maximum_total_width : 400;
  var maximum_token_size = 35; // was 60
  var minimum_token_size = 12;
  var token_horizontal_margin = 5; /* horizontal total margin should match _tokenVote.scss::.tokens-for-idea.token-icon */
  if ( maximum_tokens_per_row != 0 ){
    //maximum_tokens_per_row = maximum_tokens_per_row > 10 ? 10 : maximum_tokens_per_row;
    token_size = maximum_total_width / maximum_tokens_per_row;
  }
  else {
    if ( maximum_total_width != 0 && number_of_tokens != 0 ){
      token_size = maximum_total_width / number_of_tokens;
    }
    else {
      token_size = maximum_token_size;
    }
  }

  if ( token_size < minimum_token_size ){
    token_size = minimum_token_size;
  }
  if ( token_size > maximum_token_size ){
    token_size = maximum_token_size;
  }
  return token_size - token_horizontal_margin;
}

// Returns a random integer between min (included) and max (excluded)
// Using Math.round() will give you a non-uniform distribution!
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

// Copies el and animates it towards el2
var transitionAnimation = function(el, el2, duration){
  console.log("transitionAnimation(): ", el, el2, duration);
  if ( !el.length || !el2.length ){
    return;
  }
  if ( duration === undefined ){
    duration = 1000;
  }
  var el3 = el.clone();
  $("body").append(el3);
  el3.css("z-index",getRandomInt(1234, 11234));
  el3.css("position","fixed");

  /* this way creates a jerky movement
  el3.offset(el.offset());
  el3.animate(el2.offset(), 5000, function complete(){
    el3.remove();
  });
  */

  var elo = el.offset();
  var el2o = el2.offset();
  var top = el2o.top - elo.top;
  var left = el2o.left - elo.left;
  el3.offset(elo);
  el3.css("transition-duration", duration+"ms");
  el3.css("transform", "translate(" + left + "px, " + top + "px)");
  setTimeout(function(){
    el3.remove();
  }, duration);
};




// This view shows at the top of the popin the bag of remaining tokens the user has
var TokenBagsView = Marionette.LayoutView.extend({
  template: '#tmpl-tokenBags',
  regions: {
    "tokenBags": ".token-bags"
  },
  initialize: function(options){
    if ( !("voteSpecification" in this.options)){
      console.error("option voteSpecification is mandatory");
      return;
    }

    if ( !("tokenCategories" in this.options)){
      console.error("option tokenCategories is mandatory");
      return;
    }

    if ( !("myVotesCollection" in this.options)){
      console.error("option myVotesCollection is mandatory");
      return;
    }

    this.voteSpecification = this.options.voteSpecification;
    this.tokenCategories = this.options.tokenCategories;
    this.myVotesCollection = this.options.myVotesCollection;
    this.listenTo(this.myVotesCollection, "reset change:value", this.render);
  },
  onRender: function(){
    console.log("TokenBagsView::onRender()");
    var that = this;

    var bags = new RemainingTokenCategoriesCollectionView({
      collection: that.tokenCategories,
      myVotesCollection: that.myVotesCollection
    });
    that.getRegion('tokenBags').show(bags);
  }
});

// This view shows the remaining tokens the user has, of a given category
// This view's model is a token category (an instance of Widget.TokenCategorySpecificationModel)
var RemainingCategoryTokensView = Marionette.ItemView.extend({
  template: false,
  initialize: function(options){
    if ( !("myVotesCollection" in this.options)){
      console.error("option myVotesCollection is mandatory");
      return;
    }

    this.myVotesCollection = this.options.myVotesCollection;
  },
  onRender: function(){
    console.log("RemainingCategoryTokensView::onRender()");
    var that = this;
    var categoryContainer = this.$el;
    categoryContainer.empty();
    
    var category = this.model;
    var customTokenImageURL = category.get("image");
    var customTokenImagePromise = getSVGElementByURLPromise(customTokenImageURL);
    var data = that.myVotesCollection.getTokenBagDataForCategory(category);
    categoryContainer.addClass('token-bag-for-category');
    categoryContainer.addClass(category.getCssClassFromId());
    var el = $("<div></div>");
    el.addClass("description");
    var s = i18n.sprintf(i18n.gettext("<span class='available-tokens-number'>%d</span> remaining %s tokens"), data["remaining_tokens"], category.get("typename")); // TODO: use "name" field instead (LangString)
    el.html(s);
    //el.text("You have used " + data["my_votes_count"] + " of your " + data["total_number"] + " \"" + category.get("typename") + "\" tokens.");
    el.appendTo(categoryContainer);

    var el2 = $("<div></div>");
    el2.addClass("available-tokens-icons");
    
    el2.appendTo(categoryContainer);
    $.when(customTokenImagePromise).then(function(svgEl){ 
      var token_size = getTokenSize(data["total_number"], 20, 400);
      for ( var i = 0; i < data["remaining_tokens"]; ++i ){
        var tokenIcon = svgEl.clone();
        tokenIcon[0].classList.add("available");

        tokenIcon.css("width", token_size);
        tokenIcon.attr("width", token_size);
        tokenIcon.css("height", token_size);
        tokenIcon.attr("height", token_size);

        el2.append(tokenIcon);
      }
      for ( var i = data["remaining_tokens"]; i < data["total_number"]; ++i ){
        var tokenIcon = svgEl.clone();
        tokenIcon[0].classList.add("not-available");

        tokenIcon.css("width", token_size);
        tokenIcon.attr("width", token_size);
        tokenIcon.css("height", token_size);
        tokenIcon.attr("height", token_size);

        el2.append(tokenIcon);
      }
    });
  }
});



var RemainingTokenCategoriesCollectionView = Marionette.CollectionView.extend({
  template: false,
  childView: RemainingCategoryTokensView,
  initialize: function(options) {
    console.log("RemainingTokenCategoriesCollectionView::initialize()");
    this.childViewOptions = {
      myVotesCollection: options.myVotesCollection
    };
  },
});



// This view shows (in the block of an idea) the clickable tokens (of one given category of tokens) a user can allocate (and has allocated) on this idea
var TokenCategoryAllocationView = Marionette.ItemView.extend({
  template: '#tmpl-tokenIdeaAllocation',
  className: "token-category-allocation",
  initialize: function(options){
    this.collectionView = options.collectionView;
    this.voteItemView = options.voteItemView;
    if ( !("voteSpecification" in this.options)){
      console.error("option voteSpecification is mandatory");
      return;
    }
    // if ( !("tokenCategory" in this.options)){
    //   console.error("option tokenCategory is mandatory");
    //   return;
    // }
    if ( !("idea" in this.options)){
      console.error("option idea is mandatory");
      return;
    }
    if ( !("myVotesCollection" in this.options)){
      console.error("option myVotesCollection is mandatory");
      return;
    }

    this.voteSpecification = this.options.voteSpecification;
    console.log("this.voteSpecification: ", this.voteSpecification);
    this.idea = this.options.idea;
    this.myVotesCollection = this.options.myVotesCollection;
    this.listenTo(this.myVotesCollection, "change:category:"+this.model.getId(), this.render); // force re-render of all other token allocation views of the same token category, so that only the right icons are clickable. We use this way instead of setting this.collection to this.myVotesCollection and adding a collectionEvents hash, because does it not seem to work (probably because the hash executes before initialize())

    var myVote = this.myVotesCollection.findWhere({"idea": this.idea.get("@id"), "token_category": this.model.get("@id")});
    console.log("myVote: ", myVote);
    if ( myVote ){
      this.currentValue = myVote.get("value") || 0;
    }
    else {
      this.currentValue = 0;
    }

    // validate token category's maximum_per_idea and total_number
    var maximum_per_idea = this.model.get("maximum_per_idea");
    var total_number = this.model.get("total_number");
    if ( !_.isNumber(total_number) || total_number <= 0 || total_number > 1000 ){
      total_number = 10;
    }
    if ( !_.isNumber(maximum_per_idea) || maximum_per_idea < 0 || maximum_per_idea > 1000 ){
      maximum_per_idea = 10;
    }
    if ( maximum_per_idea == 0 ){
      maximum_per_idea = total_number;
    }
    this.maximum_per_idea = maximum_per_idea;
    this.total_number = total_number;


    // compute vote URL and data to post
    this.voteURL = null;
    this.postData = {};
    var voting_urls = "voting_urls" in this.voteSpecification ? this.voteSpecification["voting_urls"] : null;
    var idea_id = this.options.idea.get("@id");
    var category_id = this.model.get("@id");
    if ( voting_urls && _.isObject(voting_urls) && idea_id in voting_urls ){
      this.voteURL = Ctx.getUrlFromUri(voting_urls[idea_id]);
      this.postData["@type"] = "TokenIdeaVote";
      this.postData["token_category"] = category_id;
      //this.postData["value"] = 2;
      console.log("this.voteURL: ", this.voteURL);
      console.log("this.postData: ", this.postData);
    }
    else {
      console.error("could not compte this.voteURL and this.postData");
    }

    this.customTokenImageURL = this.model.get("image");
    this.customTokenImagePromise = getSVGElementByURLPromise(this.customTokenImageURL);
  },
  onRender: function(){
    console.log("TokenCategoryAllocationView::onRender()");
    var that = this;

    /*
    var colorizeSVG = function(el, color){
      el.find("*").attr("fill", color);
    }

    var contourOnlySVG = function(el, color){
      el.find("*").attr("fill", "none");
      el.find("*").attr("stroke", color);
    }
    */

    var customToken = null;
    

    var container = this.$el;

    container.hover(function handlerIn(){
      container.addClass("hover");
    }, function handlerOut(){
      container.removeClass("hover");
      container.find("svg").each(function(){
        this.classList.remove("hover");
      });
    });

    // needs: getTokenSize(), that.model, that.customTokenImageURL, customToken, zeroFullTokenIcon, that.currentValue, that.myVotesCollection, transitionAnimation(), that.postData, that.idea, that.render()
    var renderClickableTokenIcon = function(number_of_tokens_represented_by_this_icon){
      var el = null;

      var token_size = getTokenSize(that.model.get("total_number"), 20, 400); // we know this computed size will be smaller than getTokenSize(that.maximum_per_idea ? that.maximum_per_idea + 1 : 0, 10, 400); and we need icons in bags and in ideas to be the same size


      if ( number_of_tokens_represented_by_this_icon == 0 ){
        /* We used to create dynamically an icon for the zero token case, by styling the icon of the regular token. This is no longer the case, but we may revert this decision in the future.
        if ( that.customTokenImageURL ){
          el = customToken.clone();
          //contourOnlySVG(el, "#cccccc");
          el[0].classList.add("custom");
        }
        else {
          el = zeroFullTokenIcon.clone();
          el[0].classList.add("default");
        }
        */
        el = zeroFullTokenIcon.clone();
        el[0].classList.add("custom");

        el[0].classList.add("zero");
      }
      else {
        if ( that.customTokenImageURL ){
          el = customToken.clone();
          //contourOnlySVG(el, "#0000ff");
          el[0].classList.add("custom");
        }
        else {
          el = oneFullTokenIcon.clone();
          el[0].classList.add("default");
        }
        el[0].classList.add("positive");
      }
      /*
      From https://github.com/blog/2112-delivering-octicons-with-svg
      "You may have to wrap these SVGs with another div if you want to give them a background color."
      "Internet Explorer needs defined width and height attributes on the svg element in order for them to be sized correctly."
      */
      el.css("width", token_size);
      el.attr("width", token_size);
      el.css("height", token_size);
      el.attr("height", token_size);

      var showAsSelected = false;
      if ( number_of_tokens_represented_by_this_icon == 0 ){
        if ( that.currentValue == 0 ){
          showAsSelected = true;
        }
      } else if ( number_of_tokens_represented_by_this_icon <= that.currentValue ) {
        showAsSelected = true;
      }
      if ( showAsSelected ){
        el[0].classList.add("selected");
        /*
        if ( number_of_tokens_represented_by_this_icon == 0 ){
          colorizeSVG(el, "#cccccc");
        }
        else {
          colorizeSVG(el, "#00ff00");
        }
        */
      }
      else {
        el[0].classList.add("not-selected");
      }

      var tokenBagData = that.myVotesCollection.getTokenBagDataForCategory(that.model);
      var remaining_tokens = tokenBagData["remaining_tokens"];
      var userCanClickThisToken = (remaining_tokens + that.currentValue - number_of_tokens_represented_by_this_icon >= 0);
      var link = null;
      if ( userCanClickThisToken ){
        link = $('<a class="btn token-icon"></a>');
        el.appendTo(link);

        link.attr("title", "set "+number_of_tokens_represented_by_this_icon+" tokens");

        link.click(function(){
          if ( that.currentValue == number_of_tokens_represented_by_this_icon ){
            return;
          }
          console.log("set " + number_of_tokens_represented_by_this_icon + " tokens");
          var animation_duration = 800;

          var endAnimationTowardsNotAvailable = function(el){
            return function(){
              el.classList.remove("animating-towards-not-available");
              el.classList.remove("available");
              el.classList.add("not-available");
            };
          };

          var endAnimationTowardsAvailable = function(el){
            return function(){
              el.classList.remove("animating-towards-available");
              el.classList.remove("not-available");
              el.classList.add("available");
            };
          };

          // animation: are we adding or removing token to/from this idea?
          if ( that.currentValue < number_of_tokens_represented_by_this_icon ){ // we are adding tokens to this idea
            for ( var i = that.currentValue + 1; i <= number_of_tokens_represented_by_this_icon; ++i ){
              var selector = ".token-vote-session .token-bag-for-category." + that.model.getCssClassFromId() + " .available-tokens-icons .available";
              console.log("selector: ", selector);
              var theAvailableToken = $(selector).eq($(selector).length - 1 - (number_of_tokens_represented_by_this_icon - i));
              var theAllocatedToken = link.parent().children().eq(i).find("svg");
              theAvailableToken[0].classList.add("animating-towards-not-available");
              theAllocatedToken[0].classList.add("animating-towards-selected");
              setTimeout(endAnimationTowardsNotAvailable(theAvailableToken[0]), animation_duration*0.9);
              transitionAnimation(theAvailableToken, theAllocatedToken, animation_duration);
            }
          }
          else { // we are removing tokens from this idea
            var initial_value = number_of_tokens_represented_by_this_icon;
            for ( var i = that.currentValue; i > number_of_tokens_represented_by_this_icon; --i ){
              var selector = ".token-vote-session .token-bag-for-category." + that.model.getCssClassFromId() + " .available-tokens-icons .not-available";
              console.log("selector: ", selector);
              var theAvailableToken = $(selector).eq(i - number_of_tokens_represented_by_this_icon - 1);
              var theAllocatedToken = link.parent().children().eq(i).find("svg");
              theAvailableToken[0].classList.add("animating-towards-available");
              theAllocatedToken[0].classList.add("animating-towards-not-selected");
              setTimeout(endAnimationTowardsAvailable(theAvailableToken[0]), animation_duration*0.9);
              transitionAnimation(theAllocatedToken, theAvailableToken, animation_duration);
            }
          }

          var zeroToken = link.parent().children().eq(0).find("svg");
          if ( number_of_tokens_represented_by_this_icon == 0 ){
            zeroToken[0].classList.add("animating-towards-selected");
            zeroToken[0].classList.remove("animating-towards-not-selected");
          } else {
            zeroToken[0].classList.add("animating-towards-not-selected");
            zeroToken[0].classList.remove("animating-towards-selected");
          }
          
          /* This is the pure AJAX way to save the data to the backend
          that.postData["value"] = number_of_tokens_represented_by_this_icon;
          $.ajax({
            type: "POST",
            contentType: 'application/json; charset=UTF-8',
            url: that.voteURL,
            data: JSON.stringify(that.postData),
            success: function(data){
              console.log("success! data: ", data);
              that.currentValue = number_of_tokens_represented_by_this_icon;
              that.render();
            },
            error: function(jqXHR, textStatus, errorThrown){
              console.log("error! textStatus: ", textStatus, "; errorThrown: ", errorThrown);
              // TODO: show error in the UI
            }
          });
          */

          // This is a more Backbone way to save the data to the backend
          setTimeout(function(){
            var properties = _.clone(that.postData);
            delete properties["value"];
            properties["idea"] = that.idea.get("@id");
            var previousVote = that.myVotesCollection.findWhere(properties);
            console.log("previousVote found: ", previousVote);
            if ( previousVote ){
              previousVote.set({"value": number_of_tokens_represented_by_this_icon});
              previousVote.save();
            }
            else {
              properties["value"] = number_of_tokens_represented_by_this_icon;
              that.myVotesCollection.create(properties);
            }
            that.currentValue = number_of_tokens_represented_by_this_icon;
            el[0].classList.add("selected");
            container.removeClass("hover");
            that.myVotesCollection.trigger("change:category:"+that.model.getId()); // force re-render of all token allocation views of this same token category (so that the right icons are clickable)
            that.render(); // show immediately the icon it its correct state, without having to wait for collection update
          }, animation_duration*0.9);
        });
        
        link.hover(function handlerIn(){
          el[0].classList.add("hover");
          link.prevAll().children("svg").each(function(){
            if ( !(this.classList.contains("zero")) ){
              this.classList.add("hover");
            }
          });
          link.nextAll().children("svg").each(function(){
            this.classList.remove("hover");
          });
        }, function handlerOut(){
          if ( (this.classList.contains("zero")) ){
            this.classList.remove("hover");
          }
        });
      } // if ( userCanClickThisToken )
      else {
        link = $('<div class="token-icon"></div>');
        el.appendTo(link);
        el[0].classList.add("not-enough-available-tokens");
        link.attr("title", "You don't have enough tokens remaining.");
      }
      
      link.appendTo(container);
    };

    var renderAllTokenIcons = function(){
      for ( var i = 0; i <= that.maximum_per_idea; ++i ){
        renderClickableTokenIcon(i);
      }
    };

    if ( that.customTokenImageURL ){
      $.when(that.customTokenImagePromise).then(function(svgEl){
        customToken = svgEl;
        renderAllTokenIcons();
      });
    }
    else {
      renderAllTokenIcons();
    }
  },
  serializeData: function(){
    return {
      "maximum_per_idea": this.maximum_per_idea
    };
  }
});

// The collection parameter has to be a collection of token categories
var TokenCategoryAllocationCollectionView = Marionette.CollectionView.extend({
  template: '#tmpl-tokenCategoryAllocationCollection',
  childView: TokenCategoryAllocationView,
  initialize: function(options) {
    this.idea = options.idea;
    this.myVotesCollection = options.myVotesCollection;
    this.voteSpecification = options.voteSpecification;
    this.childViewOptions = {
      idea: options.idea,
      myVotesCollection: options.myVotesCollection,
      voteSpecification: options.voteSpecification,
      collectionView: this,
      voteItemView: options.parent
    };
  },
});


var TokenCategoryExclusivePairCollectionView = Marionette.LayoutView.extend({
  template: '#tmpl-tokenCategoryExclusivePairCollection',
  regions: {
    negativeTokens: ".negative-tokens",
    positiveTokens: ".positive-tokens"
  },
  initialize: function(options) {
    this.idea = options.idea;
    this.myVotesCollection = options.myVotesCollection;
    this.voteSpecification = options.voteSpecification;
    this.parent = options.parent;
  },
  onRender: function() {
    // placeholder for better code. We need to choose positive/negative
    // according to typename.
    var negativeTokens = this.collection.at(0),
        positiveTokens = this.collection.at(1),
        childViewOptions = {
      idea: this.idea,
      myVotesCollection: this.myVotesCollection,
      voteSpecification: this.voteSpecification,
      collectionView: this,
      voteItemView: this.parent,
      model: negativeTokens
    };
    this.getRegion("negativeTokens").show(new TokenCategoryAllocationView(childViewOptions));
    childViewOptions.model = positiveTokens;
    this.getRegion("positiveTokens").show(new TokenCategoryAllocationView(childViewOptions));
  },
});


// This view shows an idea in the list of votable ideas (and calls a subview which shows the tokens for this idea)
var TokenVoteItemView = Marionette.LayoutView.extend({
  template: '#tmpl-tokenVoteItem',
  initialize: function(options){
    this.childIndex = options.childIndex;
    this.parent = options.parent;
  },

  regions: {
    regionIdeaDescription: ".js_region-idea-description",
    tokensForIdea: ".tokens-for-idea"
  },

  serializeData: function(){
    return {
      "ideaTitle": (this.childIndex+1) + ". " + this.model.getShortTitleDisplayText()
    }
  },
  onRender: function(){
    var that = this;
    console.log("this.parent: ", this.parent);
    var tokenCategories = "tokenCategories" in this.parent.options ? this.parent.options.tokenCategories : null;
    var voteSpecification = "voteSpecification" in this.parent.options ? this.parent.options.voteSpecification : null;
    var myVotesCollection = "myVotesCollection" in this.parent.options ? this.parent.options.myVotesCollection : null;
    var idea = that.model;
    var tokenCategoryCollection;
    console.log("tokenCategories: ", tokenCategories);
    if ( tokenCategories ){
      // if there are 2 categories and they are exclusive, we show them on a single row
      if ( tokenCategories.length == 2 && voteSpecification && "exclusive_categories" in voteSpecification && voteSpecification.exclusive_categories ){
        // that.ui.tokensForIdea.addClass("exclusive");
        tokenCategoryCollection = new TokenCategoryExclusivePairCollectionView({
          idea: idea,
          collection: tokenCategories,
          myVotesCollection: myVotesCollection,
          voteSpecification: voteSpecification
        });
      } else {
        tokenCategoryCollection = new TokenCategoryAllocationCollectionView({
          idea: idea,
          collection: tokenCategories,
          myVotesCollection: myVotesCollection,
          voteSpecification: voteSpecification,
          parent: this
        });
      }
      this.getRegion('tokensForIdea').show(tokenCategoryCollection);
    }
  },

  onShow: function(){
    this.renderCKEditorDescription();
  },
  
  renderCKEditorDescription: function() {
    var model = this.model.getDefinitionDisplayText();

    if (!model.length) return;

    var description = new CKEditorField({
      model: this.model,
      modelProp: 'definition',
      showPlaceholderOnEditIfEmpty: false,
      canEdit: false,
      readMoreAfterHeightPx: 39 // should match the min-heght of .idea-description .  Currently this is  2*$baseLineHeightFontMultiplier*$baseFontSize (2 lines)
    });

    this.getRegion('regionIdeaDescription').show(description);
  },
});

// This view shows the list of votable ideas and their tokens
var TokenVoteCollectionView = Marionette.CompositeView.extend({
  childView: TokenVoteItemView,
  template: '#tmpl-tokenVoteCollection',
  childViewContainer: "tbody",
  childViewOptions: function(model, index){
    var that = this;
    return {
      childIndex: index,
      parent: that
    };
  },
  templateHelpers: function(){
    var that = this;
    return {
      i18n: i18n,
      numberOfIdeas: that.collection.length
    };
  }
});


// List of views for the result modal.

/*
  The view of a single vote result, which will be created by
  the collection view TokenVoteResultCollectionView
 */
var TokenVoteResultView = Marionette.LayoutView.extend({
  constructor: function TokenVoteResultView(){
    Marionette.LayoutView.apply(this, arguments);
  },

  template: '#tmpl-tokenVoteResultSingleView',

  ui: {
    // 'descriptionClick': '.js_see-idea-description',
    // 'descriptionButton': '.js_description-button',
    'descriptionRegion': '.js_region-idea-description'
  },

  events: {
    'click @ui.descriptionClick': 'onSeeDescriptionClick'
  },

  regions: {
    'regionIdeaDescription': '@ui.descriptionRegion'
  },

  //Most likely the place where D3 will be used!
  initialize: function(options){
    this.categoryIndex = options.categoryIndex;
    this.shownDescription = false;
    this.descriptionButton = i18n.gettext("See Description");
    // console.log("[TokenVoteResultView] Single result view with model", this.model);
    // console.log("The category index: ", this.categoryIndex);
  },

  serializeData: function(){
    
    var results = this.model.get('sums'); //A pojo object
    var sortedResults = _.chain(this.categoryIndex)
     .clone()
     .mapObject(function(categoryType, index){
        if (! (_.has(results, categoryType))){
          console.error('[TokenResultView][ideaId:' +
          this.model.get('objectConnectedTo').id + '] ' +
          'Idea does not have vote results for categoryType ' + categoryType);
          return false;
        }

        else {
          return results[categoryType];
        }
     })
     .values()
     .value();

    return {
      ideaTitle: this.model.get('objectConnectedTo').getShortTitleDisplayText(),
      ideaDescription: this.model.get('objectConnectedTo').getLongTitleDisplayText(),
      categoryResult: sortedResults,
      descriptionButton: this.descriptionButton
    }
  },

  onSeeDescriptionClick: function(ev){
    ev.preventDefault();

    if (this.shownDescription === true) {
      this.shownDescription = false;
      this.ui.descriptionButton.text(this.descriptionButton);
      this.ui.descriptionRegion.empty();
    }

    else {
      this.shownDescription = true;
      var descriptionButtonText = i18n.gettext("Hide Description");
      this.ui.descriptionButton.text(descriptionButtonText);
      this.ui.descriptionRegion.text(this.model.get('objectConnectedTo').getLongTitleDisplayText());
    }

  },

  onShow: function(){
    this.renderCKEditorDescription();
  },
  
  renderCKEditorDescription: function() {
    var model = this.model.get('objectConnectedTo').getDefinitionDisplayText();

    if (!model.length) return;

    var description = new CKEditorField({
      model: this.model.get('objectConnectedTo'),
      modelProp: 'definition',
      showPlaceholderOnEditIfEmpty: false,
      canEdit: false,
      readMoreAfterHeightPx: 39 // should match the min-heght of .idea-description .  Currently this is  2*$baseLineHeightFontMultiplier*$baseFontSize (2 lines)
    });

    this.getRegion('regionIdeaDescription').show(description);
  }

});

/*
  This is the collection view of each vote result
 */
var TokenVoteResultCollectionView = Marionette.CollectionView.extend({
  constructor: function TokenVoteResultCollectionView(){
    Marionette.CollectionView.apply(this, arguments);
  },

  childView: TokenVoteResultView,
  
  initialize: function(options){
    this.categoryIndex = options.categoryIndex;
  },

  childViewOptions: function(){
    return {
      categoryIndex: this.categoryIndex
    }
  }
});


/*
  The Token Vote Result View:
  It contains the question asked, and a collection view of each
  idea's vote results
 */
var TokenResultView = Marionette.LayoutView.extend({
  constructor: function ModalView(){
    Marionette.LayoutView.apply(this, arguments);
  },

  template: "#tmpl-tokenVoteResultView",

  ui: {
    'resultArea': '.js_vote-result-region',
    'categoryName': '.js_vote-result-category'
  },

  events: {
    'click @ui.categoryName': 'onCategoryClickName'
  },

  regions: {
    'results': '@ui.resultArea'
  },

  initialize: function(options){
    this.model = options.model;
    
    //categoryMap will be used by each vote result view to show the results in the correct order,
    //{index: category}
    this.categoryMap = {};
    
    var CollectionManager = require('../common/collectionManager.js'),
        cm = new CollectionManager(),
        Widget = require('../models/widget.js'),
        that = this;


    cm.getAllIdeasCollectionPromise()
      .then(function(ideas){
        that.ideas = ideas;
        //Add ONLY the subset of votable_ideas!!!
        return cm.getUserLanguagePreferencesPromise()
      .then(function(preferences){
        that.languagePreferences = preferences;
      }).then(function(){
        that.voteResults = new Widget.VoteResultCollection({widgetModel: that.model, parse: true});
        return that.voteResults.fetch();
      }).then(function(results){
        //Don't care about results, it's been fetched.
        that.tokenSpecs = that.model.getVoteSpecificationModel();
        that.voteResults.associateTo(that.ideas, that.tokenSpecs);

        //Determine the sort order of the categories and get their names:
        var categories = that.tokenSpecs.get('token_categories');
        categories.each(function(category, index){
          var name = category.get('typename');
          that.categoryMap[index] = name;
        });

        that.tokenResultsView = new TokenVoteResultCollectionView({
          collection: that.voteResults,
          categoryIndex: that.categoryMap,
          reorderOnSort: true //disable re-rendering child views on sort
        });
        if (!that.isViewDestroyed()){
          that.render();
          that.results.show(that.tokenResultsView);
        }
      });

      //Can use D3 linear scale (http://bl.ocks.org/kiranml1/6872226) to represent
      //the data.
    }); 
  },

  serializeData: function(){

    var settings = this.model.get("settings") || {},
        items = "items" in settings ? settings.items : [],
        questionItem = items.length ? items[0] : null,
        questionTitle = "question_title" in questionItem ? questionItem.question_title : "",
        questionDescription = "question_description" in questionItem ? questionItem.question_description : "",
        categories = _.values(this.categoryMap);
    
    return {
      questionTitle: questionTitle,
      questionDescription: questionDescription,
      categories: categories
    }
  },

  onCategoryClickName: function(ev){
    console.log('Category click name was clicked with event', ev);
    //Sort the collection based on the category
  },

  onShow: function(){
    console.log('[TokenResultView] onShow was called');
    var that = this;
    if (this.tokenResultsView){
      this.results.show(this.tokenResultsView);
    }
  }
});


/*
  The results modal view
  It is barely a simple container for the real view: TokenResultView
 */
var TokenVoteSessionResultModal = Backbone.Modal.extend({
  constructor: function TokenVoteSessionResultModel(){
    Backbone.Modal.apply(this, arguments);
  },

  template: '#tmpl-modalWithoutIframe',
  className: 'modal-token-vote-session popin-wrapper',
  cancelEl: '.close, .js_close',

  ui: {
    'body': '.js_modal-body'
  },

  onRender: function(){
    var resultView = new TokenResultView({model: this.model});
    this.$(this.ui.body).html(resultView.render().el);
    // resultView.onShow();
  },

  serializeData: function(){
    return {
      modal_title: "Who fucking cares?"
    }
  }

});


// This view shows the whole vote popin and its contents
var TokenVoteSessionModal = Backbone.Modal.extend({
  constructor: function TokenVoteSessionModal() {
    Backbone.Modal.apply(this, arguments);
  },

  template: '#tmpl-tokenVoteSessionModal',
  className: 'modal-token-vote-session popin-wrapper',
  cancelEl: '.close, .js_close',
  events: {
    'scroll': 'onScroll'
  },

  availableTokensPositionTop: 1000, // initial value high, will be updated in render()

  initialize: function(options) {
    var that = this;


    that.widgetModel = options.widgetModel;
    console.log("that.widgetModel: ", that.widgetModel);

    
    var CollectionManager = require('../common/collectionManager.js'); // FIXME: Why does it not work when we write it only at the top of the file?
    var collectionManager = new CollectionManager();

    var voteSpecifications = that.widgetModel.get("vote_specifications");
    console.log("voteSpecifications: ", voteSpecifications);

    that.tokenVoteSpecification = null;
    that.tokenCategories = null;
    that.myVotesCollection = null;
    that.votableIdeasCollection = null;
    
    if (voteSpecifications && voteSpecifications.length > 0){
      that.tokenVoteSpecification = _.findWhere(voteSpecifications, {"@type": "TokenVoteSpecification"});
      if ( that.tokenVoteSpecification ){
        if ( "token_categories" in that.tokenVoteSpecification && _.isArray(that.tokenVoteSpecification.token_categories) ){
          var Widget = require('../models/widget.js'); // why does it work here but not at the top of the file?
          console.log("Widget: ", Widget);
          console.log("tokenVoteSpecification.token_categories: ", that.tokenVoteSpecification.token_categories);
          that.tokenCategories = new Widget.TokenCategorySpecificationCollection(that.tokenVoteSpecification.token_categories);
          console.log("that.tokenCategories: ", that.tokenCategories);
        }
      }
    }

    // build myVotes collection from my_votes and keep it updated
    var Widget = require('../models/widget.js'); // why does it work here but not at the top of the file?
    var myVotes = "my_votes" in that.tokenVoteSpecification ? that.tokenVoteSpecification.my_votes : null;
    that.myVotesCollection = new Widget.TokenIdeaVoteCollection(myVotes);

    // This URL needs the idea id in the JSON payload
    var genericVotingUrl = "voting_url" in that.tokenVoteSpecification ? that.tokenVoteSpecification.voting_url : null; // for example: http://localhost:6543/data/Discussion/6/widgets/90/vote_specifications/22/votes
    that.myVotesCollection.url = Ctx.getUrlFromUri(genericVotingUrl); 
    console.log("that.myVotesCollection: ", that.myVotesCollection);
    
    
    collectionManager.getAllIdeasCollectionPromise().done(function(allIdeasCollection) {
      var votableIdeas = that.widgetModel.get("votable_ideas"); // contains their id but not full information (because shown by server using "id_only" view)
      var votableIdeasIds = _.pluck(votableIdeas, "@id");

      var IdeasSubset = Backbone.Subset.extend({
        constructor: function IdeasSubset() {
          Backbone.Subset.apply(this, arguments);
        },
        name: 'IdeasSubset',
        sieve: function(idea) {
          return _.contains(votableIdeasIds, idea.id);
        },
        parent: function() {
          return allIdeasCollection
        }
      });

      that.votableIdeasCollection = new IdeasSubset();

      // Compute an ordering of votable ideas
      // Each participant should always see the same ordering, but 2 different participants can see a different ordering, and all possible orderings (permutations) should be distributed among participants as equally as possible.
      // When there are much less participants than possible permutations, participants should receive permutations which are different enough (for example: participants should not all see the same idea at the top position).
      var orderedVotableIdeas = that.votableIdeasCollection.sortBy(function(idea){return idea.id;}); // /!\ with this, "local:Idea/257" < "local:Idea/36"
      var n = orderedVotableIdeas.length; // if there are n votable ideas, then there are m = n! ("n factorial") possible permutations
      // TODO: What if there are too many votable ideas and so the computation of n! would take too much time?
      if ( n < 100 ){
        var m = sFact(n);
        var u = parseInt(Ctx.getCurrentUserId());
        if ( u ){
          var permutationIndex = alternatedIndex(u % m, m);
          var permutation = nthPermutation(orderedVotableIdeas, permutationIndex, orderedVotableIdeas.length);
          console.log("permutation: ", permutation);
        }
      }

      // Show available (remaining) tokens
      var tokenBagsView = new TokenBagsView({
        voteSpecification: that.tokenVoteSpecification,
        tokenCategories: that.tokenCategories,
        myVotesCollection: that.myVotesCollection
      });
      that.$(".available-tokens").html(tokenBagsView.render().el);
      that.availableTokensPositionTop = that.$(".available-tokens").position().top;
      that.$(".available-tokens").width(that.$(".popin-body").width());

      // Show votable ideas and their tokens
      var collectionView = new TokenVoteCollectionView({
        collection: that.votableIdeasCollection,
        voteSpecification: that.tokenVoteSpecification,
        tokenCategories: that.tokenCategories,
        myVotesCollection: that.myVotesCollection,
        viewComparator: function(idea){
          return _.findIndex(permutation, function(idea2){return idea2.id == idea.id;});
        }
      });

      var regionVotablesCollection = new Marionette.Region({
        el: that.$(".votables-collection")
      });
      regionVotablesCollection.show(collectionView);
    });

  },

  onScroll: function(){
    if (this.$el.scrollTop() > this.availableTokensPositionTop) {
      this.$(".available-tokens").addClass("fixed");
    }
    else {
      this.$(".available-tokens").removeClass("fixed");
    }
  },

  serializeData: function() {
    var settings = this.widgetModel.get("settings") || {};
    var items = "items" in settings ? settings.items : [];
    var question_item = items.length ? items[0] : null;
    return {
      popin_title: i18n.gettext("Token vote"),
      question_title: "question_title" in question_item ? question_item.question_title : "",
      question_description: "question_description" in question_item ? question_item.question_description : "",
      available_tokens_info: i18n.gettext("Split your tokens among the ideas of your choice. By default, your vote is neutral per project.")
    };
  },

  onDestroy: function(){
    Ctx.clearModal({destroyModal: false});
  }
});

module.exports = {
  TokenVoteSessionModal: TokenVoteSessionModal,
  TokenVoteSessionResultModal: TokenVoteSessionResultModal
};
