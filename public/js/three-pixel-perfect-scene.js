(function() {

  // Pixel Perfect Scene
  // Input dimensions match output dimensions
  // aspect ratio matches
  // orthographic, no depth scaling so x and y are never distorted
  // (0,0) is centered, for laziness

  THREE.pixelPerfectScene = function() {

    var renderer, 
        camera, 
        scene,
        width = 1280,
        height = 720,
        depth = 1280;

    var my = function(element) {
      camera = camera || new THREE.OrthographicCamera( -width / 2, width / 2, height / 2, -height / 2, -depth, depth );

      scene = new THREE.Scene();

      renderer = new THREE.WebGLRenderer();
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(width, height);

      element.innerHTML = ''; // remove anything, including if this has been added previously. Messy and effective.

      element.appendChild(renderer.domElement);
    };

    my.renderer = function(_) {
      if (!arguments.length) return renderer;
      renderer = _;
      return my;
    };

    my.camera = function(_) {
      if (!arguments.length) return camera;
      camera = _;
      return my;
    };

    my.scene = function(_) {
      if (!arguments.length) return scene;
      scene = _;
      return my;
    };

    my.width = function(_) {
      if (!arguments.length) return width;
      width = _;
      return my;
    };

    my.height = function(_) {
      if (!arguments.length) return height;
      height = _;
      return my;
    };

    my.depth = function(_) {
      if (!arguments.length) return depth;
      depth = _;
      return my;
    };

    my.render = function() {
      renderer.render(scene, camera);
    };

    my.add = function(object) {
      scene.add(object);
      return my;
    };

    return my;
  };

})();