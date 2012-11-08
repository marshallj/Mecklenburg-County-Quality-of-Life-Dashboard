var FTmeta,
    activeRecord = {},
    activeMeasure = "p1",
    wsbase = "http://maps.co.mecklenburg.nc.us/rest/",
    map,
    geojson,
    info,
    legend,
    marker;


$(document).ready(function() {

    // Load JSON metric configuration
    $.ajax({
        url: "js/metrics.json",
        dataType: "json",
        async: false,
        success: function(data){
            FTmeta = data;
        }
    });

    updateData(FTmeta[activeMeasure]);

    // Add metrics to sidebar and report list
    var writebuffer = "";
    var category = "";
    $.each(FTmeta, function(index) {
        if (this.style.breaks.length > 0) {
            $('p[data-group=' + this.category + ']').append('<a href="javascript:void(0)" class="measure-link" data-measure="' + this.field + '">' + this.title + ' <i></i></a><br>');
            if (index === 0 || this.category != category) {
                if (index !== 0) writebuffer += '</optgroup>';
                writebuffer += '<optgroup label="' + capitaliseFirstLetter(this.category) + '">';
                category = this.category;
            }
            writebuffer += '<option value="' + this.field + '">' + this.title + '</option>';
        }
    });
    writebuffer += '</optgroup>';
    $("#report_metrics").html(writebuffer);

    // Set default metric in sidebar
    $('a[data-measure=p1]').children("i").addClass("icon-chevron-right");

    // Click events for sidebar
    $("a.measure-link").on("click", function(e) {
        $("a.measure-link").children("i").removeClass("icon-chevron-right");
        $(this).children("i").addClass("icon-chevron-right");
        if ( $(window).width() <= 767 ) $('html, body').animate({ scrollTop: $("#data").offset().top }, 1000);
        changeMeasure( $(this).data("measure") );
        e.stopPropagation();
    });
    $(".sidenav li p").on("click", function(e) { e.stopPropagation(); });
    $(".sidenav li.metrics-dropdown").on("click", function() {
        $(this).addClass("active").siblings().removeClass("active");
        $(this).siblings().children("p").each(function(){
            if (!$(this).is(':hidden')) $(this).animate({ height: 'toggle' }, 250);
        });
        $(this).children("p").animate({ height: 'toggle' }, 250);
    });

    // Geolocation link click event
    $(".gps").click(function() {
        map.locate({ enableHighAccuracy: true });
    });

    // Highlight any search box text on click
    $("#searchbox").click(function() { $(this).select(); });

    // Show the overview introduction text
    $(".show-overview").on("click", function(){
        $(".measure-info").hide();
        $(".overview").fadeIn();
        activeRecord = {};
        geojson.setStyle(style);
        map.setView([35.260, -80.807], 10);
        window.location.hash = "";
    });

    // Opacity slider
    $( "#opacity_slider" ).slider({ range: "min", value: 70, min: 25, max: 100, stop: function (event, ui) {
            geojson.setStyle(style);
        }
    }).sliderLabels('Map','Data');

    // Autocomplete
    $("#searchbox").autocomplete({
        minLength: 4,
        delay: 300,
        autoFocus: true,
        source: function(request, response) {
        $.ajax({
            url: wsbase + "v2/ws_geo_ubersearch.php",
            dataType: "jsonp",
            data: {
                searchtypes: "Address,Library,School,Park,GeoName,Road,CATS,Intersection,PID,NSA",
                query: request.term
            },
            success: function(data) {
                if (data.total_rows > 0) {
                    response($.map(data.rows, function(item) {
                        return {
                            label: urldecode(item.row.displaytext),
                            value: item.row.displaytext,
                            responsetype: item.row.responsetype,
                            responsetable: item.row.responsetable,
                            getfield: item.row.getfield,
                            getid: item.row.getid
                        };
                    }));

                }
                else if (data.total_rows == 0) {
                    response($.map([{}], function(item) {
                        return {
                            // Message indicating nothing is found
                            label: "No records found."
                        };
                    }));
                }
                        else if  (data.total_rows == -1) {
                             response($.map([{}], function(item) {
                                  return {
                                       // Message indicating no search performed
                                       label: "More information needed for search."
                                  };
                             }));
                        }
                   }
              });
         },
         select: function(event, ui) {
              // Run function on selected record
              if (ui.item.responsetype) {
                   locationFinder(ui.item.responsetype, ui.item.responsetable, ui.item.getfield, ui.item.getid, ui.item.label, ui.item.value);
              }
         },
         open: function(event, ui) {
            $(this).keypress(function(e){
                if (e.keyCode == 13 || e.keyCode == 39) {
                   $($(this).data('autocomplete').menu.active).find('a').trigger('click');
                }
            });
            // Go if only 1 result
            menuItems = $("ul.ui-autocomplete li.ui-menu-item");
            if (menuItems.length == 1 && menuItems.text() != "More information needed for search." && menuItems.text() != "No records found.") {
                $($(this).data('autocomplete').menu.active).find('a').trigger('click');
            }
         }
    }).data("autocomplete")._renderMenu = function (ul, items) {
         var self = this, currentCategory = "";
         $.each( items, function( index, item ) {
              if ( item.responsetype != currentCategory && item.responsetype !== undefined) {
                   ul.append( "<li class='ui-autocomplete-category'>" + item.responsetype + "</li>" );
                   currentCategory = item.responsetype;
              }
              self._renderItem( ul, item );
         });
    };

});

/*
    Window load events
 */
$(window).load(function(){
    // load map
    mapInit();

    // Process hash and add listener for navigation
    hashRead();
    window.addEventListener("hashchange", hashRead, false);
});

/*
    Hash reading and writing
*/
function hashChange() {
    $("body").addClass("nonav");
    window.location.hash = "/" + activeMeasure + "/" + ((activeRecord.id) ? activeRecord.id : "");
}
function hashRead() {
    if (!$("body").hasClass("nonav")) {
        if (window.location.hash.length > 1) {
            theHash = window.location.hash.replace("#","").split("/");

            // Process the lat,lon or neighborhood number
            if (theHash[2] && theHash[2].length > 0) {
                if (theHash[2].indexOf(",") == -1) {
                    changeNeighborhood(theHash[2], true);
                    var layer = getNPALayer(theHash[2]);
                    zoomToFeature(layer.getBounds());
                }
                else {
                    coords = theHash[2].split(",");
                    performIntersection(coords[0], coords[1]);
                }
            }

            // Process the metric
            if (theHash[1].length > 0 && !$('a[data-measure=' + theHash[1] + ']').children("i").hasClass("icon-chevron-right")) {
                if ( $('a[data-measure=' + theHash[1] + ']').parent("p").is(':hidden') ) $('a[data-measure=' + theHash[1] + ']').parent("p").parent("li").trigger("click");
                $("a.measure-link").children("i").removeClass("icon-chevron-right");
                $('a[data-measure=' + theHash[1] + ']').children("i").addClass("icon-chevron-right");
                changeMeasure(theHash[1], true);
            }
        }
    }
    else { $("body").removeClass("nonav"); }
}

/*
    Change active measure
*/
function changeMeasure(measure, nohash) {
    nohash = (typeof nohash === "undefined") ? false : nohash;
    activeMeasure = measure;
    // get average if haven't already
    if (!FTmeta[activeMeasure].style.avg) calcAverage(activeMeasure);
    geojson.setStyle(style);
    legend.update();
    info.update();
    var layer = getNPALayer(activeRecord.id);
    if (jQuery.isEmptyObject(activeRecord) === false && layer.feature.properties[measure] != null ) {
        updateData(FTmeta[activeMeasure]);
        $(".overview").hide();
        $(".measure-info").show();
        highlightSelected(layer);
    }
    else {
        $(".measure-info").hide();
        $(".overview").fadeIn();
    }
    if (!nohash) hashChange();
}

function calcAverage(measure) {
    if (!FTmeta[activeMeasure].style.avg) {
        var theSum = 0;
        $.each(geojson._layers, function() {
            theSum = theSum + this.feature.properties[measure];
        });
        FTmeta[measure].style.avg = Math.round(theSum / 464);
    }
}

/*
    Change active neighborhood
*/
function changeNeighborhood(npaid, nohash) {
    nohash = (typeof nohash === "undefined") ? false : nohash;
    var layer = getNPALayer(npaid);
    assignData(layer.feature.properties);
    $(".overview").hide();
    $(".measure-info").show();
    updateData(FTmeta[activeMeasure]);
    highlightSelected(layer);
    if (!nohash) hashChange();
}

/*
    Assign data to active record
 */
function assignData(data) {
    $.each(data, function(key, value){
        activeRecord[key] = value;
    });

    // Select neighborhood in report
    $("#report_neighborhood option[selected]").removeAttr("selected");
    $("#report_neighborhood option[value=" + activeRecord.id + "]").attr('selected', 'selected');
}


/*
    Update detailed data
*/
function updateData(measure) {
    if (activeRecord.id) {
        $("#selectedNeighborhood").html("Neighborhood Profile Area " + activeRecord.id);
        $("#selectedValue").html(numberWithCommas(activeRecord[measure.field]) + measure.style.units);
        // charts
        barChart(measure);
        if (measure.auxchart) { auxChart(measure); }
        else { $("#indicator_auxchart").empty(); }
    }

    // set neighborhood overview
    $("#selectedMeasure").html(measure.title);
    $("#indicator_description").html(measure.description);

    // set details info

    $("#indicator_why").html(measure.importance);
    $("#indicator_technical").empty();
    if (measure.tech_notes.length > 0) $("#indicator_technical").append('<p>' + measure.tech_notes + '</p>');
    if (measure.source.length > 0) $("#indicator_technical").append('<p>' + measure.source + '</p>');
    $("#indicator_resources").empty();

    // Quick links
    if (measure.quicklinks) {
        quicklinks = [];
        $.each(measure.quicklinks, function(index, value) {
            quicklinks[index] = '<a href="javascript:void(0)" class="quickLink" onclick="changeMeasure(\'' + value + '\')">' + FTmeta[value]["title"] + '</a>';
        });
        $("#indicator_resources").append("<h5>Related Variables</h5><p>" + quicklinks.join(", ") + "</p>");
    }

    // Links
    if (measure.links) {
        $("#indicator_resources").append("<h5>Links</h5><p>" + measure.links + "</p>");
    }

    // Show stuff
    $("#welcome").hide();
    $("#selected-summary").show("fade", {}, 1500);
}

/*
    Bar Chart
*/
function barChart(measure){
    var data = google.visualization.arrayToDataTable([
          ['Year', 'NPA ' + activeRecord.id, 'County Average'],
          ['2010',  parseFloat(activeRecord[measure.field]), Math.round(FTmeta[measure.field].style.avg) ]
        ]);

    var options = {
      title: numberWithCommas(activeRecord[measure.field]) + measure.style.units,
      titlePosition: 'out',
      titleTextStyle: { fontSize: 14 },
      vAxis: {title: 'Year',  titleTextStyle: {color: 'red'}},
      hAxis: { minValue: 0 },
      width: $("aside").width(),
      height: 150,
      legend: 'bottom'
    };
    if (measure.style.units == "%") options.hAxis = { minValue: 0, maxValue: 100 };

    var chart = new google.visualization.BarChart(document.getElementById('details_chart'));
    chart.draw(data, options);
}

/*
    Extra chart
*/
function auxChart(measure) {
    // add each measure to array
    items = [];
    items[0] = ["test","test"];
    i = 1;
    $.each(measure.quicklinks, function(index, value) {
        if (activeRecord[value] > 0) {
            items[i] = [ FTmeta[value].title.replace("Commute by ","").replace("Commute ","") + " " + activeRecord[FTmeta[value].field] + "%",  activeRecord[FTmeta[value].field] ];
            i++;
        }
    });

    var data = google.visualization.arrayToDataTable(items);

    var options = {
        width: $("aside").width(),
        height: 180,
        legend: 'right',
        titlePosition: 'out',
        title: measure.auxchart.title,
        titleTextStyle: { fontSize: 14 },
        pieSliceText: 'value',
        chartArea: {top: 35,  height: 135}
    };

    var chart = new google.visualization.PieChart(document.getElementById('indicator_auxchart'));
    chart.draw(data, options);
}



/********************************************


    Map Stuff


********************************************/
var tmpdata;
function mapInit() {

    // initialize map
    map = new L.Map('map', {
        center: [35.260, -80.807],
        zoom: 10,
        minZoom: 9,
        maxZoom: 16
    });
    map.attributionControl.setPrefix(false).setPosition("bottomleft");

    //  Add Base Layer
    L.tileLayer( "http://maps.co.mecklenburg.nc.us/mbtiles/mbtiles-server.php?db=meckbase-desaturated.mbtiles&z={z}&x={x}&y={y}",
     { "attribution": "<a href='http://emaps.charmeck.org'>Mecklenburg County GIS</a>" } ).addTo( map );

    // Load NPA geojson
    $.ajax({
        url: "js/npa.json",
        dataType: "json",
        type: "GET",
        async: false,
        success: function(data) {
           tmpdata = data;
           geojson = L.geoJson(data, { style: style, onEachFeature: onEachFeature }).addTo(map);
           calcAverage(activeMeasure);
        }
    });

    // Locate user position via GeoLocation API
    if (!Modernizr.geolocation) $(".gpsarea").hide();
    map.on('locationfound', function(e) {
        var radius = e.accuracy / 2;
        performIntersection(e.latlng.lat, e.latlng.lng);
    });

    // Hover information
    info = L.control();
    info.onAdd = function (map) {
        this._div = L.DomUtil.create('div', 'info'); // create a div with a class "info"
        this.update();
        return this._div;
    };
    info.update = function (props) {
        this._div.innerHTML = '<h4>' + FTmeta[activeMeasure].title + '</h4>' +  (props && props[activeMeasure] != undefined ?
            '<b>NPA ' + props.id + '</b><br />Score: ' + numberWithCommas(props[activeMeasure]) + FTmeta[activeMeasure].style.units + '<br>NPA Average: ' + numberWithCommas(FTmeta[activeMeasure].style.avg)  + FTmeta[activeMeasure].style.units :
            props && props[activeMeasure] == undefined ? '<b>NPA: ' + props.id + '</b><br />No data available.' :
            '');
    };
    info.addTo(map);

    // Legend
    legend = L.control({position: 'bottomright'});
    legend.onAdd = function (map) {
        this._div = L.DomUtil.create('div', 'info legend');
        this.update();
        return this._div;
    };
    legend.update = function() {
        var theLegend = '<i style="background: #666666"></i> <span id="legend-">No Data</span><br>';
        $.each(FTmeta[activeMeasure].style.breaks, function(index, value) {
            theLegend += '<i style="background:' + FTmeta[activeMeasure].style.colors[index] + '"></i> <span id="legend-' + index + '">' +
                value + (FTmeta[activeMeasure].style.colors[index + 1] ? '&ndash;' + FTmeta[activeMeasure].style.breaks[index + 1] + FTmeta[activeMeasure].style.units + '</span><br>' : FTmeta[activeMeasure].style.units + '+</span>');
        });
        this._div.innerHTML = theLegend;
    };
    legend.addTo(map);
}

/*
    Map NPA geojson decoration functions
*/
function onEachFeature(feature, layer) {
    layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: selectFeature
    });
}
function style(feature) {
    return {
        fillColor: getColor(feature.properties[activeMeasure]),
        weight: 2,
        opacity: 1,
        color: '#666',
        dashArray: '3',
        fillOpacity: $("#opacity_slider").slider("value") / 100
    };
}

function getColor(d) {
    var color = "";
    var colors = FTmeta[activeMeasure].style.colors.reverse();
    var breaks = FTmeta[activeMeasure].style.breaks.reverse();
    $.each(breaks, function(index, value) {
        if (d >= value && d !== null) {
            color = colors[index];
            return;
        }
    });
    if (color.length > 0) return color;
    else return "#666666";
}
function highlightFeature(e) {
    var layer = e.target;
    if (!activeRecord || (activeRecord && activeRecord.id != e.target.feature.properties.id)) layer.setStyle({
        weight: 4,
        color: '#666',
        dashArray: ''
    });
    if (!L.Browser.ie && !L.Browser.opera) {
        layer.bringToFront();
    }
    info.update(layer.feature.properties);
}

function resetHighlight(e) {
    if (!activeRecord || (activeRecord && activeRecord.id != e.target.feature.properties.id)) geojson.resetStyle(e.target);
    info.update();
}
function highlightSelected(layer) {
    geojson.setStyle(style);
    layer.setStyle({
        weight: 5,
        color: '#3366CC',
        dashArray: '',
        fillOpacity: 0.7
    });
    if (!L.Browser.ie && !L.Browser.opera) {
        layer.bringToFront();
    }
}
function zoomToFeature(bounds) {
    map.fitBounds(bounds);
}
function selectFeature(e) {
    var layer = e.target;
    if (layer.feature.properties[activeMeasure] != null) changeNeighborhood(layer.feature.properties.id);
    zoomToFeature(layer.getBounds());
}

/*
    Add marker
*/
function addMarker(lat, lng) {
    if (marker) {
        try { map.removeLayer(marker); }
        catch(err) {}
    }
    marker = L.marker([lat, lng]).addTo(map);
}

/*
    Get xy NPA intersection via web service
*/
function performIntersection(lat, lon) {
    url = wsbase + 'v1/ws_geo_pointoverlay.php?geotable=neighborhoods&callback=?&format=json&srid=4326&fields=id&parameters=&x=' + lon + '&y=' + lat;
    $.getJSON(url, function(data) {
        if (data.total_rows > 0) {
            changeNeighborhood(data.rows[0].row.id);
            addMarker(lat, lon);
            var layer = getNPALayer(data.rows[0].row.id);
            zoomToFeature(layer.getBounds());
        }
    });
}

/*
    Get NPA feature
*/
function getNPALayer(idvalue) {
    var layer;
    $.each(geojson._layers, function() {
        if (this.feature.properties.id == idvalue) layer = this;
    });
    return layer;
}


/**
 * Find locations
 * @param {string} findType  The type of find to perform
 * @param {string} findTable  The table to search on
 * @param {string} findField  The field to search in
 * @param {string} findID  The value to search for
 */
function locationFinder(findType, findTable, findField, findID, findLabel, findValue) {
    // grab the hash to rebuild it with the coordinates
    theHash = window.location.hash.replace("#","").split("/");

    switch (findType) {
        case "Address": case "PID": case "API":
            url = wsbase + 'v1/ws_mat_addressnum.php?format=json&callback=?&jsonp=?&addressnum=' + findID;
            $.getJSON(url, function(data) {
                if (data.total_rows > 0) {
                    performIntersection(data.rows[0].row.latitude, data.rows[0].row.longitude);
                }
            });
            break;
        case "Library": case "Park": case "School": case "GeoName": case "CATS": case "NSA":
            // Set list of fields to retrieve from POI Layers
            poiFields = {
                "libraries" : "x(transform(the_geom, 4326)) as lon, y(transform(the_geom, 4326)) as lat, '<h5>' || name || '</h5><p>' || address || '</p>' AS label",
                "schools_1011" : "x(transform(the_geom, 4326)) as lon, y(transform(the_geom, 4326)) as lat, '<h5>' || coalesce(schlname,'') || '</h5><p>' || coalesce(type,'') || ' School</p><p>' || coalesce(address,'') || '</p>' AS label",
                "parks" : "x(transform(the_geom, 4326)) as lon, y(transform(the_geom, 4326)) as lat, '<h5>' || prkname || '</h5><p>Type: ' || prktype || '</p><p>' || prkaddr || '</p>' AS label",
                "geonames" : "longitude as lon, latitude as lat, '<h3>' || name || '</h3>'  as label",
                "neighborhood_statistical_areas" : "x(transform(ST_Centroid(the_geom), 4326)) as lon, y(transform(ST_Centroid(the_geom), 4326)) as lat, '<h5>' || nsa_name || '</h5><p></p>' as label",
                "cats_light_rail_stations" : "x(transform(the_geom, 4326)) as lon, y(transform(the_geom, 4326)) as lat, '<h5>' || name || '</h5><p></p>' as label",
                "cats_park_and_ride" : "x(transform(the_geom, 4326)) as lon, y(transform(the_geom, 4326)) as lat, '<h5>' || name || '</h5><p>Routes ' || routes || '</p><p>' || address || '</p>' AS label"
            };
            url = wsbase + "v1/ws_geo_attributequery.php?format=json&geotable=" + findTable + "&parameters=" + urlencode(findField + " = " + findID) + "&fields=" + urlencode(poiFields[findTable]) + '&callback=?';
            $.getJSON(url, function(data) {
                if (data.total_rows > 0) {
                    performIntersection(data.rows[0].row.lat, data.rows[0].row.lon);
                }
            });
            break;
        case "Road":
            url = wsbase + "v1/ws_geo_getcentroid.php?format=json&geotable=" + findTable + "&parameters=streetname='" + findValue + "' order by ll_add limit 1&forceonsurface=true&srid=4326&callback=?";
            $.getJSON(url, function(data) {
                if (data.total_rows > 0) {
                    performIntersection(data.rows[0].row.y, data.rows[0].row.x);
                }
            });

            break;
        case "Intersection":
            url = wsbase + "v1/ws_geo_centerlineintersection.php?format=json&callback=?";
            streetnameArray = findID.split("&");
            args = "&srid=4326&streetname1=" + urlencode(jQuery.trim(streetnameArray[0])) + "&streetname2=" + urlencode(jQuery.trim(streetnameArray[1]));
            $.getJSON(url + args, function(data) {
                if (data.total_rows > 0 ) {
                    if (data.total_rows > 0) {
                        performIntersection(data.rows[0].row.xcoord, data.rows[0].row.ycoord);
                    }
                }
            });
            break;
    }
}