(function() { 

  var flatten = function (arr) {
    if (!Array.isArray(arr)) {
      return [arr];
    }
    return [].concat.apply([], arr);
  };

  d3.gsapStoryboard = function(gsapTimeline) {

    var tweenInfo = function(tw, baseStartTime) {
      baseStartTime = baseStartTime || 0;

      if ('getChildren' in tw) {
        baseStartTime += tw.startTime();
        return tw.getChildren(false).map(function(t) { return tweenInfo(t, baseStartTime); });
      }

      return {
        start: tw.startTime() + baseStartTime,
        duration: tw.duration(),
        target: tw.target
      };
    };

    var storyboard = d3.storyboard()
                       .on('update', function(pos) { gsapTimeline.progress(pos / gsapTimeline.totalDuration(), true); })
                       .on('play', function() { gsapTimeline.play(); })
                       .on('pause', function() { gsapTimeline.pause(); })
                       .on('stop', function() {
                          gsapTimeline.pause();
                          gsapTimeline.seek(0);
                       })
                       .on('speed', function(speed) {
                          gsapTimeline.timeScale(speed);
                       });

    var updateProgress = function() {
      storyboard.position(gsapTimeline.progress() * gsapTimeline.totalDuration());
    };

    gsapTimeline.eventCallback('onUpdate', updateProgress);

    storyboard.updateFromGsapTimeline = function() {
      storyboard.duration(gsapTimeline.totalDuration())
                .labels(gsapTimeline.getLabelsArray())
                .tweens(flatten(tweenInfo(gsapTimeline)));

      return storyboard;
    };

    storyboard.updateFromGsapTimeline();

    return storyboard;
  };

  d3.storyboard = function() {

    const TEMPLATE = `
        <svg class="controls">
          <rect class="background" x="0" y="0" width="100%" height="100%" />
          <g class="time-label" transform="translate(5,25)">
            <text></text>
          </g>
          <g transform="translate(0,30)">
            <g class="button play-btn">
              <text class="fa">\uf04b</text>
            </g>
            <g class="button stop-btn">
              <text class="fa">\uf04d</text>
            </g>
            <g class="button bookmark-btn">
              <text class="fa">\uf02e</text>
            </g>
            <g class="button step-to-bookmark-btn">
              <text class="fa">\uf048</text>
            </g>
            <g class="button zoom-in-btn">
              <text class="fa">\uf00e</text>
            </g>
            <g class="button zoom-out-btn">
              <text class="fa">\uf010</text>
            </g>
            <g class="button unselect-btn">
              <text class="fa">\uf00d</text>
            </g>
          </g>
          <g class="speed-slider">
            <g class="axis"></g>
            <g class="handle">
              <path d="M0,0 l-5,-5 h-5 v10 h5 z" />
            </g>
          </g>
        </svg>
        <div class="timeline">
          <svg class="timeline-graphic">
            <rect class="background" x="0" y="0" width="100%" height="100%" />
            <g>
              <g class="axis time-axis" transform="translate(0,12)"></g>
              <g class="axis-overlay">
                <rect opacity="0.00001" x="0" y="0" width="100%" height="12" />
              </g>
              <g class="labels" transform="translate(0,12)"></g>
              <g class="tweens" transform="translate(0,30)"></g>
              <g transform="translate(0,12)">
                <g class="bookmark">
                  <path d="M0,1 h10 v12 l-5,-5 l-5,5 z" />
                </g>
              </g>
              <g class="position">
                <path d="M0,12 l-11,-11 h22 z" />
                <line x1="0" y1="12" x2="0" y2="100%" />
              </g>
            </g>
          </svg>
        </div>
    `;

    var root,
        controls,
        timeline,
        timelineWidth = 100,
        timelineHeight = 100,
        scrollDiv = 0,
        positionBounds = [0,1],
        callbacks = {
          update: [],
          play: [],
          pause: [],
          stop: [],
          speed: []
        },
        playing = false,
        duration = 0,
        position = 0,
        timeScale = d3.scaleLinear()
                      .clamp(true),
        zoom = 1,
        logSpeed = 0,
        speedScale = d3.scaleLinear()
                       .domain([2, -2])
                       .clamp(true),
        bookmarkTime = 0,
        labels = [],
        tweens = [],
        screen;

    var timeFormat = function(pos) {
      var m = String(Math.floor(pos / 60)),
          s = Math.floor(pos % 60),
          t = Math.floor((pos % 1) * 10);
      return m + ':' + (s < 10 ? '0' : '') + s + '.' + t;
    };

    var raiseEvent = function(event) {
      switch (event) {
        case 'update':
        case 'play':
        case 'pause':
        case 'stop':
          callbacks[event].forEach(function(cb) { cb(position); });
          break;

        case 'speed':
          callbacks[event].forEach(function(cb) { cb(Math.pow(10, logSpeed)); });
          break;
      }
    };

    var assignLanes = function() {
      var maxLane = 0;

      for (var i = 0; i < tweens.length; i++) {
        var tw = tweens[i],
            validLanes = d3.range(maxLane);

        tw.end = tw.start + tw.duration;

        for (var j = 0; j < i; j++) {
          var e = tweens[j];
          if (validLanes.indexOf(e.lane) > -1 && 
              (tw.start >= e.start && tw.start < (e.end+0.017) || tw.end >= e.start && tw.end < e.end)) {

            validLanes.splice(validLanes.indexOf(e.lane), 1);
          }
        }

        if (validLanes.length === 0) {
          tw.lane = maxLane;
          maxLane++;
        } else {
          tw.lane = validLanes[0];
        }
      }
    };

    var updateSpeed = function(suppressCallback) {
      controls.select('.speed-slider .handle')
              .attr('transform', 'translate(0,' + speedScale(logSpeed) + ')');
      
      if (!suppressCallback) {
        raiseEvent('speed');
      }
    };

    var updateLabels = function() {
      if (!timeline) {
        return;
      }

      var gs = timeline.select('.labels').selectAll('.storyboard-label')
                        .data(labels, function(d) { return d.name; })
                        .enter()
                        .append('g')
                        .attr('class', 'storyboard-label')
                        .on('click', function(d) {
                          my.seek(d.time);
                        });

      gs.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', 0)
        .attr('y2', 12);

      gs.append('text')
        .attr('dx', 3)
        .attr('dy', 10)
        .text(function(d) { return d.name; });

      timeline.select('.labels').selectAll('.storyboard-label')
              .attr('transform', function(d) { return 'translate(' + timeScale(d.time) + ',0)'; });
    };

    var updateTweens = function() {
      if (!timeline) {
        return;
      }

      assignLanes();

      var laneCount = d3.max(tweens.map(function(d) { return d.lane; }))+1,
          laneHeight = (timelineHeight-30) / laneCount;

      timeline.select('.tweens').selectAll('.tween')
              .data(tweens)
              .enter()
              .append('g')
              .attr('class', 'tween')
              .on('dblclick', function(d) {
                my.seek(d.start-0.017);
              })
              .on('click', function(d) {

                var targets = flatten(d.target || []); 

                if (!d3.select(this).classed('selected')) {
                  
                  d3.select(this).classed('selected', true);

                  if (screen) {
                    d.highlight = targets.map(function(d) {
                      return screen.append('rect')
                                          .datum({ node: d })
                                          .attr('class', 'target-highlight');
                    });
                    updateHighlight();
                  }
                } else {
                  
                  d3.select(this).classed('selected', false);

                  if (screen && d.highlight) {
                    d.highlight.forEach(function(h) {
                      h.remove();
                    });
                  }
                }
              })
              .append('rect')
              .attr('height', laneHeight)
              .attr('fill', function(d) { return d3.cubehelix(d.start*1000, 0.4, 0.5); });

      timeline.select('.tweens').selectAll('.tween')
              .attr('transform', function(d) { return 'translate(' + timeScale(d.start) + ',' + (laneHeight*d.lane) + ')'; })
              .selectAll('rect')
              .attr('width', function(d) { return timeScale(d.duration); });
    };

    var updateHighlight = function() {
      if (!screen || !timeline) {
        return;
      }

      screen.selectAll('rect.target-highlight')
            .each(function(d) {
              d.bbox = d.node.getBBox();
            })
            .attr('x', function(d) { return d.bbox.x-2; })
            .attr('width', function(d) { return d.bbox.width+4; })
            .attr('y', function(d) { return d.bbox.y-2; })
            .attr('height', function(d) { return d.bbox.height+4; });
    };

    var updateTimeline = function() {
      if (!timeline) {
        return;
      }

      timeScale.domain([0, duration])
               .range([0, timelineWidth * zoom])
               .nice();

      timeline.attr('width', timeScale.range()[1]+1)
              .attr('height', timelineHeight);

      timeline.select('.time-axis')
              .call(d3.axisTop(timeScale).ticks(10)
                      .ticks(20 * zoom)
                      .tickSize(12)
                      .tickFormat(timeFormat))
              .selectAll('text')
              .attr('dx', 3)
              .attr('dy', 12);

      updateLabels();

      updateTweens();

      updatePosition(true);
    };

    var updatePosition = function(suppressCallback, transition) {
      if (!timeline) {
        return;
      }

      if (!transition) {
        timeline.select('.position')
                .attr('transform', 'translate(' + timeScale(position) + ',0)');
      } else {
        timeline.select('.position')
                .transition()
                .duration(250)
                .attr('transform', 'translate(' + timeScale(position) + ',0)');
      }

      if (timeScale(position) < scrollDiv.node().scrollLeft + 200) {
        scrollDiv.node().scrollLeft = timeScale(position) - 200;
      } 

      if (timeScale(position) > scrollDiv.node().scrollLeft + timelineWidth - 200) {
        scrollDiv.node().scrollLeft = timeScale(position) - timelineWidth + 200;
      }

      controls.select('.time-label text')
              .text(timeFormat(position));

      if (!suppressCallback) {
        raiseEvent('update');
      }

      updateHighlight();
    };

    var updateBookmark = function() {
      if (!timeline) {
        return;
      }

      timeline.select('.bookmark')
              .transition()
              .duration(250)
              .attr('transform', 'translate(' + timeScale(position) + ',0)');
    };

    var my = function(selection) {
      selection.each(function() {
        root = d3.select(this).select('.storyboard');

        if (root.empty()) {
          root = d3.select(this)
                   .append('div')
                   .attr('class', 'storyboard')
                   .html(TEMPLATE);

          controls = root.select('svg.controls');
          timeline = root.select('svg.timeline-graphic');
          scrollDiv = root.select('.timeline');
          labelGs = timeline.select('.labels').selectAll('.storyboard-label');

          controls.select('.play-btn')
                  .on('click', function() {
                    if (!playing) {
                      my.play();
                    } else {
                      my.pause();
                    }
                  });

          controls.select('.stop-btn')
                  .on('click', my.stop);

          controls.select('.bookmark-btn')
                  .on('click', function() {
                    bookmarkTime = position;
                    updateBookmark();
                  });

          controls.select('.step-to-bookmark-btn')
                  .on('click', function() {
                    my.seek(bookmarkTime);
                  });

          controls.select('.zoom-in-btn')
                  .on('click', function() {
                    my.zoom(my.zoom() * 2);
                  });

          controls.select('.zoom-out-btn')
                  .on('click', function() {
                    if (my.zoom() > 1) {
                      my.zoom(my.zoom() / 2);
                    }
                  });

          controls.select('.unselect-btn')
                  .on('click', function() {
                    timeline.selectAll('.tween.selected')
                            .classed('selected', false)
                            .each(function(d) {
                              if (screen && d.highlight) {
                                d.highlight.forEach(function(h) {
                                  h.remove();
                                });
                              }
                            });
                  });

          controls.select('.speed-slider')
                  .call(d3.drag()
                          .on('start', function() {
                            logSpeed = speedScale.invert(d3.mouse(this)[1]);
                            updateSpeed();
                          })
                          .on('drag', function() {
                            logSpeed = speedScale.invert(d3.mouse(this)[1]);
                            if (Math.abs(speedScale(logSpeed) - speedScale(0)) < 5) {
                              logSpeed = 0;
                            }
                            updateSpeed();
                          }));

          timeline.select('.position')
                  .call(d3.drag()
                          .on('start', function() {
                            my.pause();
                          })
                          .on('drag', function() {
                            position = timeScale.invert(d3.event.x);
                            updatePosition();
                          }));

          timeline.select('.axis-overlay')
                  .on('click', function() {
                    my.seek(timeScale.invert(d3.mouse(timeline.node())[0]));
                  });
        }

        var containerSize = root.node().getBoundingClientRect();

        timelineWidth = containerSize.width - containerSize.height*0.75 - 1;
        timelineHeight = containerSize.height;

        controls.attr('width', containerSize.height*0.75)
                .attr('height', containerSize.height);

        var btnSize = (containerSize.height - 30) / 4;
        controls.selectAll('.button')
                .attr('transform', function(d, i) { 
                  return 'translate(' + ((i%2)*btnSize+btnSize*0.1) + ',' + (Math.floor(i/2)*btnSize+btnSize*0.75) + ')';
                })
                .style('font-size', String(btnSize*0.75) + 'px');

        speedScale.range([0, containerSize.height-20]);

        controls.select('.speed-slider')
                .attr('transform', 'translate(' + (btnSize*2.5) + ',10)');

        controls.select('.speed-slider .axis')
                .call(d3.axisRight(speedScale)
                        .tickValues([2, 1, 0, -1, -2])
                        .tickFormat(function (n) { return ['--', '-', '0', '+', '++'][n+2]; }));

        updateSpeed(true);

        updateTimeline();
      });
    };

    my.duration = function(_) {
      if (!arguments.length) return duration;
      duration = +_;
      bookmarkTime = Math.min(duration, bookmarkTime);
      updateTimeline();
      return my;
    };

    my.zoom = function(_) {
      if (!arguments.length) return zoom;
      zoom = +_;
      updateTimeline();
      return my;
    };

    my.position = function(_) {
      if (!arguments.length) return position;
      position = +_ || 0;
      updatePosition(true);
      return my;
    };

    my.speed = function(_) {
      if (!arguments.length) return Math.pow(10, speed);
      logSpeed = Math.log10(+_ || 1);
      updateSpeed(true);
      return my;
    };

    my.screen = function(_) {
      if (!arguments.length) return screen;
      screen = _;
      return my;
    };

    my.labels = function(_) {
      if (!arguments.length) return labels;
      labels = _;
      updateLabels();
      return my;
    };

    my.tweens = function(_) {
      if (!arguments.length) return tweens;
      tweens = _;
      updateTweens();
      return my;
    };

    my.on = function(event, cb) {
      if (!(event in callbacks)) {
        console.warn("Storyboard doesn't have " + event + " event");
        return my;
      }

      callbacks[event].push(cb);

      return my;
    };  

    my.play = function() {
      if (playing) {
        return my;
      }

      playing = true;

      controls.selectAll('.play-btn text')
              .text('\uf04c');

      raiseEvent('play');

      return my;
    };

    my.pause = function() {
      if (!playing) {
        return my;
      }

      playing = false;

      controls.selectAll('.play-btn text')
              .text('\uf04b');

      raiseEvent('pause');

      return my;
    };

    my.stop = function() {
      my.pause();
      my.seek(0);

      return my;
    };

    my.seek = function(time) {
      my.pause();

      position = time;
      updatePosition(false, true);

      return my;
    };

    return my;
  }; 

})();