"use strict";

voteApp.controller('resultsCtl',
  ['$scope', '$http', '$routeParams', '$log', '$location', 'globalConfig', 'configTestingService', 'configService', 'Discussion', 'AssemblToolsService', 'VoteWidgetService',
  function($scope, $http, $routeParams, $log, $location, globalConfig, configTestingService, configService, Discussion, AssemblToolsService, VoteWidgetService) {

    // intialization code (constructor)

    $scope.init = function() {
      console.log("resultsCtl::init()");

      console.log("configService:");
      console.log(configService);
      $scope.settings = configService.settings;
      console.log("settings 0:");
      console.log($scope.settings);

      // check that the user is logged in
      if (!configService.user || !configService.user.verified)
      {
        alert('You have to be authenticated to vote. Please log in and try again.');
        window.location.assign("/login");
        return;
      }

      $scope.user = configService.user;

      $scope.drawUI();
    };

    $scope.getVoteSpecFieldInSettings = function(vote_spec, field_name){
      if ( "settings" in vote_spec ){
        if( field_name in vote_spec.settings ){
          return vote_spec.settings[field_name];
        }
      }
      return null;
    };

    $scope.getVoteSpecByURI = function(uri){
      var widget = configService;
      if ( "vote_specifications" in widget ){
        if ( widget.vote_specifications.length ){
          var sz = widget.vote_specifications.length;
          for ( var i = 0; i < sz; ++i ){
            var vote_spec = widget.vote_specifications[i];
            if ( "@id" in vote_spec && vote_spec["@id"] == uri ){
              return vote_spec;
            }
          }
        }
      }
      return null;
    };

    $scope.getVoteSpecLabelByURI = function(uri){
      var vote_spec = $scope.getVoteSpecByURI(uri);
      if ( vote_spec )
        return $scope.getVoteSpecFieldInSettings(vote_spec, "name");
      return null;
    };

    $scope.drawUI = function() {
      $scope.drawUIWithoutTable();
    };

    $scope.drawUIWithoutTable = function() {
      console.log("drawUIWithoutTable()");
      var widget = configService;
      var settings = "settings" in widget ? widget.settings : null;
      var items = "items" in settings ? settings.items : null;

      var questions = window.getUrlVariableValue("questions"); // A "question" is a vote_spec of a vote widget. Here we get a comma-separated list of vote_spec URIs
      if ( questions ){
        questions = questions.split(",");
      }
      console.log("questions: ", questions);

      var results_uris = "voting_results_by_spec_url" in widget ? widget.voting_results_by_spec_url : null;
      console.log("results_uris: ", results_uris);
      var results_urls = {};
      var results_promises = {};
      
      var destination = d3.select("body");

      var single_vote_spec_result_received = function(vote_spec_uri, destination_for_this_result){
        return function(vote_spec_result_data){
          console.log("promise " + vote_spec_uri + " resolved to: ", vote_spec_result_data);
          var filter_by_targets = null;
          $scope.drawResultsForAllTargetsOfVoteSpecification(destination_for_this_result, vote_spec_uri, vote_spec_result_data, filter_by_targets);
        }
      };

      var grouped_vote_spec_results_received = function(vote_spec_uris, destination_for_this_result){
        return function(vote_spec_result_data){
          console.log("promise " + vote_spec_uris[0] + " resolved to: ", vote_spec_result_data);
          var filter_by_targets = null;
          $scope.drawResultsForAllTargetsOfTwoCombinedVoteSpecifications(destination_for_this_result, vote_spec_uris[0], vote_spec_uris[1], vote_spec_result_data, filter_by_targets);
        }
      };

      // iterate on all items and display vote results in this order
      if ( items && items.length ){
        items.forEach(function(item, item_index){
          var item_vote_specifications = "vote_specifications" in item ? item.vote_specifications : null;
          var item_type = "type" in item ? item.type : null;
          if ( item_vote_specifications && item_vote_specifications.length ){
            if ( item_type != "2_axes" && item_vote_specifications.length == 1 ){ // this is a single criterion item/question, so we show its results as a bar chart
              var vote_spec = item_vote_specifications[0];
              var vote_spec_id = "@id" in vote_spec ? vote_spec["@id"] : null;
              if ( vote_spec_id ){
                results_urls[vote_spec_id] = AssemblToolsService.resourceToUrl(results_uris[vote_spec_id]) + "?histogram=10"; // TODO: this could be a customizable URL parameter
                if ( !questions || (questions.indexOf(vote_spec_id) != -1) ){
                  results_promises[vote_spec_id] = $.ajax(results_urls[vote_spec_id]);
                  var destination_for_this_result = destination.append("div");
                  $.when(results_promises[vote_spec_id]).done(single_vote_spec_result_received(vote_spec_id, destination_for_this_result));
                }
              }
            } else if ( item_type == "2_axes" && item_vote_specifications.length == 2 ){ // this is a 2_axes item, so we show its results as a heatmap
              var vote_spec_id = null;
              var first = true;
              var second_vote_spec_id = "@id" in item_vote_specifications[1] ? item_vote_specifications[1]["@id"] : null;
              item_vote_specifications.forEach(function(vote_spec){
                vote_spec_id = "@id" in vote_spec ? vote_spec["@id"] : null;
                if ( vote_spec_id ){
                  results_urls[vote_spec_id] = AssemblToolsService.resourceToUrl(results_uris[vote_spec_id]) + "?histogram=10"; // TODO: this could be a customizable URL parameter
                  if ( !questions || (questions.indexOf(vote_spec_id) != -1) ){
                    results_promises[vote_spec_id] = $.ajax(results_urls[vote_spec_id]);
                    if ( first ){
                      first = false;
                      // each vote_spec which shares a question_id property with other vote_specs contains all single and grouped vote results
                      var destination_for_this_result = destination.append("div");
                      $.when(results_promises[vote_spec_id]).done(grouped_vote_spec_results_received([vote_spec_id, second_vote_spec_id], destination_for_this_result));
                    }
                  }
                }
              });
            }
          }
        });
      }

      console.log("results_urls: ", results_urls);
      console.log("results_promises: ", results_promises);

      console.log("drawUIWithoutTable() completed");
    };

    $scope.drawResultsForAllTargetsOfTwoCombinedVoteSpecifications = function(destination, x_vote_spec_uri, y_vote_spec_uri, vote_specs_result_data, filter_by_targets){
      console.log("vote_specs_result_data: ", vote_specs_result_data);
      if ( vote_specs_result_data ){
        if ( $.isEmptyObject(vote_specs_result_data) ){ // there is no vote yet (on this vote_spec, on any of its available targets), but we have to show it instead of showing nothing
          if ( !filter_by_targets ){
            //$scope.drawResultAsBarChartForSingleTargetOfVoteSpecification(destination, vote_spec_uri, {}, null);
            var vote_spec_label = $scope.getVoteSpecLabelByURI(vote_spec_uri) || vote_spec_uri;
            destination.append("p").html("There is no vote yet for question \"<span title='" + vote_spec_uri + "'>" + vote_spec_label + "\", on any of its target ideas.");
          }
        } else {
          var data = null;
          // we will find the bigger group of vote specifications => the one which has the most of commas in its key
          var max_number_of_commas = 0;
          var best_key = null;
          var count_number_of_commas = function(str){
            return (str.match(/,/g) || []).length;
          };
          for ( var vote_spec_list_key in vote_specs_result_data ){ // vote_spec_list_key is a vote specification id, or several ones delimited by a comma
            var current_number_of_commas = count_number_of_commas(vote_spec_list_key);
            if ( current_number_of_commas > max_number_of_commas ){
              max_number_of_commas = current_number_of_commas;
              best_key = vote_spec_list_key;
            }
          }
          if ( best_key ){
            data = vote_specs_result_data[best_key];
            if ( !( best_key.indexOf(x_vote_spec_uri) != -1 && best_key.indexOf(y_vote_spec_uri) != -1 ) ){
              console.log("ALERT: key ", best_key, " does not contain both of the criteria we were looking for: ", x_vote_spec_uri, y_vote_spec_uri );
              // should we still display these heatmaps?
            }
            // TODO: i'm not sure the order of vote_specs is kept
            var first_vote_spec_uri = best_key.split(",")[0];
            var second_vote_spec_uri = best_key.split(",")[1];
            for ( var target in data ){
              if ( !filter_by_targets || (filter_by_targets.indexOf(target) != -1) ){
                $scope.drawResultAsHeatmapForSingleTargetOfTwoVoteSpecifications(destination, first_vote_spec_uri, second_vote_spec_uri, data[target], target);
              }
            }
          }
        }
      }
    };

    /*
     * Heatmap is based on http://bl.ocks.org/mbostock/3202354
     */
    $scope.drawResultAsHeatmapForSingleTargetOfTwoVoteSpecifications = function(destination, x_vote_spec_uri, y_vote_spec_uri, vote_spec_result_data_for_target, target){
      console.log("drawing heatmap for vote specs ", x_vote_spec_uri, " and ", y_vote_spec_uri, ", and target ", target, ", which has data ", vote_spec_result_data_for_target);

      var x_vote_spec = $scope.getVoteSpecByURI(x_vote_spec_uri);
      var y_vote_spec = $scope.getVoteSpecByURI(y_vote_spec_uri);
      console.log("current x_vote_spec: ", x_vote_spec);
      console.log("current y_vote_spec: ", y_vote_spec);
      var x_vote_spec_type = (x_vote_spec && "@type" in x_vote_spec) ? x_vote_spec["@type"] : "LickertVoteSpecification";
      if ( x_vote_spec_type != "LickertVoteSpecification" ){
        console.log("ERROR: x_vote_spec_type is not of type LickertVoteSpecification. Instead: ", x_vote_spec_type);
      }
      var y_vote_spec_type = (y_vote_spec && "@type" in y_vote_spec) ? y_vote_spec["@type"] : "LickertVoteSpecification";
      if ( y_vote_spec_type != "LickertVoteSpecification" ){
        console.log("ERROR: y_vote_spec_type is not of type LickertVoteSpecification. Instead: ", y_vote_spec_type);
      }

      var x_vote_spec_label = $scope.getVoteSpecLabelByURI(x_vote_spec_uri) || x_vote_spec_uri;
      var y_vote_spec_label = $scope.getVoteSpecLabelByURI(y_vote_spec_uri) || y_vote_spec_uri;

      var data = [];
      var result_number_of_voters = 0;
      if ( "n" in vote_spec_result_data_for_target )
        result_number_of_voters = vote_spec_result_data_for_target.n;

      var result_heatmap_data = [];
      var result_histogram = [];
      var heatmap_y_size = null;
      var heatmap_x_size = null;
      var heatmap_y_step = 10;
      var heatmap_x_step = 10;
      var lickert_y_min_value = "minimum" in y_vote_spec ? y_vote_spec.minimum : 0;
      var lickert_x_min_value = "minimum" in x_vote_spec ? x_vote_spec.minimum : 0;
      var lickert_y_max_value = "maximum" in y_vote_spec ? y_vote_spec.maximum : 100;
      var lickert_x_max_value = "maximum" in x_vote_spec ? x_vote_spec.maximum : 100;

      if ( "histogram" in vote_spec_result_data_for_target ){
        result_histogram = vote_spec_result_data_for_target.histogram;
        
        heatmap_y_size = result_histogram.length;
        console.log("heatmap_y_size: ", heatmap_y_size);
      }

      if ( heatmap_y_size > 0 ){
        heatmap_y_step = (lickert_y_max_value - lickert_y_min_value) / heatmap_y_size;
        heatmap_x_size = result_histogram[0].length;
        if ( heatmap_x_size > 0 ){
          heatmap_x_step = (lickert_x_max_value - lickert_x_min_value) / heatmap_x_size;
        } else {
          heatmap_x_step = 10;
        }
      } else {
        // create empty data to show to the user
        heatmap_y_size = 10;
        heatmap_x_size = 10;
        for ( var y = 0; y < heatmap_y_size; ++y ){
          result_histogram[y] = [];
          for ( var x = 0; x < heatmap_x_size; ++x ){
            result_histogram[y][x] = 0;
          }
        }
        result_number_of_voters = 0;
      }
      console.log("result_histogram: ", result_histogram);


      var current_y_step = lickert_y_min_value;
      result_histogram.forEach(function(row, row_index){
        var current_x_step = lickert_x_min_value;
        row.forEach(function(element, element_index){
          var frequency = 0;
          if ( result_number_of_voters > 0 ){
            frequency = element / result_number_of_voters;
          }
          result_heatmap_data.push({
            "y_bucket": current_y_step,
            "x_bucket": current_x_step,
            "votes": element,
            "frequency": frequency
          });
          current_x_step += heatmap_x_step;
        });
        current_y_step += heatmap_y_step;
      });

      console.log("result_heatmap_data: ", result_heatmap_data);
      data = result_heatmap_data;


      var str = "Vote results for criteria \"<span title='" + x_vote_spec_uri + "'>" + x_vote_spec_label + "</span>\" and \"<span title='" + y_vote_spec_uri + "'>" + y_vote_spec_label + "</span>\"." + "<br/>number of votes: " + result_number_of_voters;
      destination.append("p").html(str);


      var chart_holder = destination.append("div");
      chart_holder.classed({"heatmap": true});





      var margin = {top: 20, right: 90, bottom: 30, left: 50},
          width = 960 - margin.left - margin.right,
          height = 500 - margin.top - margin.bottom;

      var parseDate = d3.time.format("%Y-%m-%d").parse,
          formatDate = d3.time.format("%b %d");

      // var x = d3.time.scale().range([0, width]);
      var x = d3.scale.linear().range([0, width]);
      var y = d3.scale.linear().range([height, 0]);
      var z = d3.scale.linear().range(["white", "steelblue"]);

      // The size of the buckets in the CSV data file.
      // This could be inferred from the data if it weren't sparse.
      var xStep = heatmap_x_step; // was 864e5,
      var yStep = heatmap_y_step; // was 100;

      var svg = chart_holder.append("svg")
          .attr("width", width + margin.left + margin.right)
          .attr("height", height + margin.top + margin.bottom)
        .append("g")
          .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        // Coerce the CSV data to the appropriate types.
        data.forEach(function(d) {
          //d.date = parseDate(d.date);
          d.y_bucket = +d.y_bucket;
          d.x_bucket = +d.x_bucket;
          d.votes = +d.votes;
          d.frequency = +d.frequency;
        });

        // Compute the scale domains.
        x.domain(d3.extent(data, function(d) { return d.x_bucket; }));
        y.domain(d3.extent(data, function(d) { return d.y_bucket; }));
        z.domain([0, d3.max(data, function(d) { return d.votes; })]);

        // Extend the x- and y-domain to fit the last bucket.
        // For example, the y-bucket 3200 corresponds to values [3200, 3300].
        x.domain([x.domain()[0], +x.domain()[1] + xStep]);
        y.domain([y.domain()[0], y.domain()[1] + yStep]);

        // Display the tiles for each non-zero bucket.
        // See http://bl.ocks.org/3074470 for an alternative implementation.
        svg.selectAll(".tile")
            .data(data)
          .enter().append("rect")
            .attr("class", "tile")
            .attr("x", function(d) { return x(d.x_bucket); })
            .attr("y", function(d) { return y(d.y_bucket + yStep); })
            .attr("width", x(xStep) - x(0))
            .attr("height",  y(0) - y(yStep))
            .style("fill", function(d) { return z(d.votes); });

        // Add a legend for the color values.
        var legend = svg.selectAll(".legend")
            .data(z.ticks(6).slice(1).reverse())
          .enter().append("g")
            .attr("class", "legend")
            .attr("transform", function(d, i) { return "translate(" + (width + 20) + "," + (20 + i * 20) + ")"; });

        legend.append("rect")
            .attr("width", 20)
            .attr("height", 20)
            .style("fill", z);

        legend.append("text")
            .attr("x", 26)
            .attr("y", 10)
            .attr("dy", ".35em")
            .text(String);

        svg.append("text")
            .attr("class", "label")
            .attr("x", width + 20)
            .attr("y", 10)
            .attr("dy", ".35em")
            .text("Count"); // TODO: i18n

        // Add an x-axis with label.
        svg.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + height + ")")
            .call(d3.svg.axis().scale(x).orient("bottom")) // was .call(d3.svg.axis().scale(x).ticks(d3.time.days).tickFormat(formatDate).orient("bottom"))
          .append("text")
            .attr("class", "label")
            .attr("x", width)
            .attr("y", -6)
            .attr("text-anchor", "end")
            .text(x_vote_spec_label);

        // Add a y-axis with label.
        svg.append("g")
            .attr("class", "y axis")
            .call(d3.svg.axis().scale(y).orient("left"))
          .append("text")
            .attr("class", "label")
            .attr("y", 6)
            .attr("dy", ".71em")
            .attr("text-anchor", "end")
            .attr("transform", "rotate(-90)")
            .text(y_vote_spec_label);
    };

    $scope.drawResultsForAllTargetsOfVoteSpecification = function(destination, vote_spec_uri, vote_spec_result_data, filter_by_targets){
      console.log("vote_spec_result_data: ", vote_spec_result_data);
      if ( vote_spec_result_data ){
        if ( $.isEmptyObject(vote_spec_result_data) ){ // there is no vote yet (on this vote_spec, on any of its available targets), but we have to show it instead of showing nothing
          if ( !filter_by_targets ){
            //$scope.drawResultAsBarChartForSingleTargetOfVoteSpecification(destination, vote_spec_uri, {}, null);
            var vote_spec_label = $scope.getVoteSpecLabelByURI(vote_spec_uri) || vote_spec_uri;
            destination.append("p").html("There is no vote yet for question \"<span title='" + vote_spec_uri + "'>" + vote_spec_label + "\", on any of its target ideas.");
          }
        } else {
          for ( var target in vote_spec_result_data ){
            if ( target.indexOf("local:AbstractVoteSpecification/") == 0 ){ // this means instead of having target ideas as keys, the backed first gives us the AbstractVoteSpecification id, so we have to iterate one more depth level
              if ( target == vote_spec_uri ){ // here we care only about current vote_spec_uri
                for ( var target_real in vote_spec_result_data[target] ){
                  if ( !filter_by_targets || (filter_by_targets.indexOf(target_real) != -1) ){
                    $scope.drawResultAsBarChartForSingleTargetOfVoteSpecification(destination, vote_spec_uri, vote_spec_result_data[target][target_real], target_real);
                  }
                }
              }
            }
            else {
              if ( !filter_by_targets || (filter_by_targets.indexOf(target) != -1) ){
                $scope.drawResultAsBarChartForSingleTargetOfVoteSpecification(destination, vote_spec_uri, vote_spec_result_data[target], target);
              }
            }
          }
        }
      }
    };

    /*
     * Bar chart is based on http://bl.ocks.org/Caged/6476579
     */
    $scope.drawResultAsBarChartForSingleTargetOfVoteSpecification = function(destination, vote_spec_uri, vote_spec_result_data_for_target, target){
      console.log("drawing vote result for vote_spec_uri ", vote_spec_uri, " and target ", target, " which has data ", vote_spec_result_data_for_target);

      var vote_spec = $scope.getVoteSpecByURI(vote_spec_uri);
      console.log("current vote_spec: ", vote_spec);
      var vote_spec_type = (vote_spec && "@type" in vote_spec) ? vote_spec["@type"] : "LickertVoteSpecification"; // can also be "MultipleChoiceVoteSpecification"

      var data = null;
      var result_number_of_voters = 0;
      if ( "n" in vote_spec_result_data_for_target )
        result_number_of_voters = vote_spec_result_data_for_target.n;

      if ( vote_spec_type == "BinaryVoteSpecification"){
        
        var labelYes = $scope.getVoteSpecFieldInSettings(vote_spec, "labelYes") || "Yes";
        var labelNo = $scope.getVoteSpecFieldInSettings(vote_spec, "labelNo") || "No";

        var votesYes = ("yes" in vote_spec_result_data_for_target) ? vote_spec_result_data_for_target.yes : 0;
        var votesNo = ("no" in vote_spec_result_data_for_target) ? vote_spec_result_data_for_target.no : 0;
        data = [
          {
            "label": labelYes,
            "votes": votesYes,
            "frequency": result_number_of_voters > 0 ? (votesYes / result_number_of_voters) : 0
          },
          {
            "label": labelNo,
            "votes": votesNo,
            "frequency": result_number_of_voters > 0 ? (votesNo / result_number_of_voters) : 0
          }
        ];
      }
      else if ( vote_spec_type == "MultipleChoiceVoteSpecification" ){

        data = [];

        var candidates = $scope.getVoteSpecFieldInSettings(vote_spec, "candidates");
        console.log("candidates: ", candidates);

        // first, create empty data (because vote results do not contain candidates which received zero vote)
        if ( candidates ){
          for ( var i = 0; i < candidates.length; ++i ){
            data.push({
              "label": candidates[i],
              "votes": 0,
              "frequency": 0
            });
          }
        }

        // then, fill data with vote results
        if ( "results" in vote_spec_result_data_for_target ){
          for ( var key in vote_spec_result_data_for_target.results ){
            console.log("key: ", key);
            console.log("parseInt(key): ", parseInt(key));
            console.log("candidates[parseInt(key)]: ", candidates[parseInt(key)]);
            var label = candidates ? candidates[parseInt(key)] : key;
            var votes = vote_spec_result_data_for_target.results[key];
            var frequency = result_number_of_voters > 0 ? (votes / result_number_of_voters) : 0;
            var data_item = _.findWhere(data, {"label": label});
            if ( data_item ){
              data_item.label = label;
              data_item.votes = votes;
              data_item.frequency = frequency;
            } else {
              data.push({
                "label": label,
                "votes": votes,
                "frequency": frequency
              });
            }
          }
        }

        console.log("final data: ", data);
      
      } else { // "LickertVoteSpecification"

        var result_average = null;
        if ( "avg" in vote_spec_result_data_for_target )
          result_average = vote_spec_result_data_for_target.avg;

        var result_standard_deviation = null;
        if ( "std_dev" in vote_spec_result_data_for_target )
          result_standard_deviation = vote_spec_result_data_for_target.std_dev;

        var result_histogram_data = [];
        var result_histogram = [];
        var lickert_value_min = "minimum" in vote_spec ? +vote_spec.minimum : 0;
        var lickert_value_max = "maximum" in vote_spec ? +vote_spec.maximum : 100;
        var lickert_value_cur = lickert_value_min;
        var histogram_size = null;
        var histogram_step = 10;

        if ( "histogram" in vote_spec_result_data_for_target ){
          result_histogram = vote_spec_result_data_for_target.histogram;
          
          histogram_size = result_histogram.length;
          console.log("histogram_size: ", histogram_size);
        }

        if ( histogram_size > 0 ){
          histogram_step = (lickert_value_max - lickert_value_min) / histogram_size;
        } else {
          // create empty data to show to the user
          histogram_size = 10;
          for ( var i = 0; i < histogram_size; ++i )
            result_histogram.push(0);
          result_number_of_voters = 0;
        }
        console.log("result_histogram: ", result_histogram);

        result_histogram.forEach( function(number_of_voters_in_slice){
          var label = "" + lickert_value_cur.toFixed(0) + "-" + (lickert_value_cur+histogram_step).toFixed(0); // temporary

          var frequency = 0;
          if (result_number_of_voters > 0)
            frequency = number_of_voters_in_slice / result_number_of_voters;

          result_histogram_data.push({
            "label": label,
            "votes": number_of_voters_in_slice,
            "frequency": frequency
          });

          lickert_value_cur += histogram_step;
        } );

        console.log("result_histogram_data: ", result_histogram_data);

        data = result_histogram_data;
      }


      var margin = {
        top: 40,
        right: 20,
        bottom: 30,
        left: 40
      };

      var width = 500 - margin.left - margin.right;
      var height = 300 - margin.top - margin.bottom;

      var formatPercent = d3.format(".0%");

      var x = d3.scale.ordinal()
        .rangeRoundBands([0, width], .1);

      var y = d3.scale.linear()
        .range([height, 0]);

      var xAxis = d3.svg.axis()
        .scale(x)
        .orient("bottom");

      var yAxis = d3.svg.axis()
        .scale(y)
        .orient("left")
        .tickFormat(formatPercent);


      var tip = d3.tip()
        .attr('class', 'd3-tip')
        .offset([-10, 0])
        .html(function(d) {
          return "<strong>Frequency:</strong> <span style='color:red'>" + d.frequency + "</span>"
            + "<br/>" + "<strong>Votes:</strong> <span style='color:red'>" + d.votes + "</span>";
        });

      var vote_spec_label = $scope.getVoteSpecLabelByURI(vote_spec_uri) || vote_spec_uri;

      var target_idea_url = AssemblToolsService.resourceToUrl(target);
      var target_idea_promise = $.ajax(target_idea_url);
      var target_idea_label = target; // using target URI as label while waiting for its real label

      var result_info = destination.append("p");
      result_info.classed("result-info");
      var populateResultInfo = function(){
        var text = "Vote result for question \"<span title='" + vote_spec_uri + "'>" + vote_spec_label + "</span>\" and target idea \"<span title='" + target + "'>" + target_idea_label + "</span>\":";
        var text_number_of_votes = "number of votes: " + result_number_of_voters;
        if ( vote_spec_type == "MultipleChoiceVoteSpecification" || vote_spec_type == "BinaryVoteSpecification" ){
          // add only the number of votes
          text += "<br/>" + text_number_of_votes;
        } else {
          // add number of votes, average and standard deviation
          var text_average = "average: " + result_average;
          var text_standard_deviation = "standard deviation: " + result_standard_deviation;
          text += "<br/>" + text_number_of_votes + "<br/>" + text_average + "<br/>" + text_standard_deviation;
        }
        result_info.html(text);
      };    

      populateResultInfo();

      $.when(target_idea_promise).done(function(data){
        console.log("target_idea_promise data received: ", data);
        if ( "shortTitle" in data ){
          target_idea_label = data.shortTitle;
          populateResultInfo();          
        }
      });

      

      var svg = destination.append("svg")
        .classed({"barchart": true})
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
          .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

      svg.call(tip);

      x.domain(data.map(function(d) { return d.label; }));
      y.domain([0, d3.max(data, function(d) { return d.frequency; })]);
      svg.append("g")
          .attr("class", "x axis")
          .attr("transform", "translate(0," + height + ")")
          .call(xAxis);
      svg.append("g")
          .attr("class", "y axis")
          .call(yAxis)
        .append("text")
          .attr("transform", "rotate(-90)")
          .attr("y", 6)
          .attr("dy", ".71em")
          .style("text-anchor", "end")
          .text("Frequency");

      svg.selectAll(".bar")
        .data(data)
        .enter()
        .append("rect")
          .attr("class", "bar")
          .attr("x", function(d) { return x(d.label); })
          .attr("width", x.rangeBand())
          .attr("y", function(d) { return y(d.frequency); })
          .attr("height", function(d) { return height - y(d.frequency); })
          .on('mouseover', tip.show)
          .on('mouseout', tip.hide);
    };

  }]);