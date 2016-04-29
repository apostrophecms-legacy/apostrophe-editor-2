/* jshint node:true */

var clone = require('clone');

module.exports = function(options, callback) {
  return new Construct(options, callback);
};

module.exports.Construct = Construct;

function Construct(options, callback) {
  var apos = options.apos;
  var app = options.app;

  var self = this;

  apos.mixinModuleAssets(self, 'editor-2', __dirname, options);

  // Tells ckeditor where to find the rest of itself despite minification
  self.pushAsset('script', 'beforeCkeditor', { when: 'user' });
  self.pushAsset('script', 'vendor/ckeditor/ckeditor', { when: 'user', preshrunk: true });
  self.pushAsset('script', 'editor', { when: 'user' });
  self.pushAsset('script', 'splitHtml', { when: 'user' });
  self.pushAsset('stylesheet', 'editor', { when: 'user' });
  self.pushAsset('stylesheet', '../js/vendor/ckeditor/skins/apostrophe/editor', { when: 'user' });
  self.pushAsset('template', 'itemButtons', { when: 'user' });
  self.pushAsset('template', 'lockedItemButtons', { when: 'user' });
  self.pushAsset('template', 'lockedWidgetButtons', { when: 'user' });
  self.pushAsset('template', 'richText', { when: 'user' });
  self.pushAsset('template', 'itemSeparator', { when: 'user' });

  apos.pushGlobalData({
    editor2: {
      plugins: options.plugins || [],
      // overrides properties of the ckeditor config object we build via _.extend
      config: options.config
    }
  });

  app.post('/apos-editor-2/content-menu', function(req, res) {
    var controls;
    if (req.body.controls) {
      controls = apos.sanitizeStrings(req.body.controls);
    } else {
      // So we don't inadvertently modify the original
      controls = clone(apos.defaultControls);
    }
    var richText = apos.sanitizeBoolean(req.body.richText, true);
    if (richText) {
      controls.unshift('richText');
    }
    return res.send(self.render('contentMenu', { controls: controls, itemTypes: apos.itemTypes, richText: richText, addLabel: req.body.addLabel }, req));
  });

  apos.on('tasks:register', function(taskGroups) {
    taskGroups.apostrophe.migrateToLockups = function(apos, argv, callback) {
      return apos.forEachItem(function(page, name, area, offset, item, callback) {
        var lockup;
        var set = {};
        var unset = {};
        var setUnset = {};
        var key = 'areas.' + name + '.items.' + offset;
        unset[key + '.position'] = 1;
        unset[key + '.size'] = 1;
        if (unset) {
          setUnset.$unset = unset;
        }
        if ((item.position === 'left') || (item.position === 'right')) {
          set[key + '.lockup'] = item.position;
          console.log('Migrating lockup on ' + page.slug);
          setUnset.$set = set;
        }

        if (setUnset.$set || setUnset.$unset) {
          return apos.pages.update({ _id: page._id }, setUnset, callback);
        } else {
          return callback(null);
        }

      }, callback);
    };
  });

  return setImmediate(function() { return callback(null); });
}

