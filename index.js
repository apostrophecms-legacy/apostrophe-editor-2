var extend = require('extend');
var _ = require('underscore');
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
  self.pushAsset('script', 'vendor/ckeditor/ckeditor', { when: 'user' });
  self.pushAsset('script', 'editor', { when: 'user' });
  self.pushAsset('stylesheet', 'editor', { when: 'user' });
  self.pushAsset('template', 'itemButtons', { when: 'user' });
  self.pushAsset('template', 'lockedItemButtons', { when: 'user' });
  self.pushAsset('template', 'lockedWidgetButtons', { when: 'user' });
  self.pushAsset('template', 'richText', { when: 'user' });
  self.pushAsset('template', 'itemSeparator', { when: 'user' });

  self.render = function(name, data) {
    return apos.partial(name, data, __dirname + '/views');
  };

  app.post('/apos-editor-2/content-menu', function(req, res) {
    var controls;
    if (req.body.controls) {
      controls = apos.sanitizeStrings(req.body.controls);
    } else {
      // So we don't inadvertently modify the original
      controls = clone(apos.defaultControls);
    }
    richText = apos.sanitizeBoolean(req.body.richText, true);
    if (richText) {
      controls.unshift('richText');
    }
    return res.send(self.render('contentMenu', { controls: controls, itemTypes: apos.itemTypes, richText: richText, addLabel: req.body.addLabel }));
  });

  // Constructor name for our client side object that edits areas and should be
  // instantiated whenever an area the user has permission to output is present
  // without waiting for an edit button to be clicked ("always editing")
  apos.alwaysEditing = 'AposEditor2';

  // Push the knowledge that an always-on editor is in use to the browser
  apos.pushGlobalData({
    alwaysEditing: true
  });

  apos.on('tasks:register', function(taskGroups) {
    taskGroups.apostrophe.migrateToLockups = function(apos, argv, callback) {
      return apos.forEachItem(function(page, name, area, offset, item, callback) {
        var lockup;
        var set = {};
        var unset = {};
        var key = 'areas.' + name + '.items.' + offset;
        unset[key + '.position'] = 1;
        unset[key + '.size'] = 1;
        if ((item.position === 'left') || (item.position === 'right')) {
          set[key + '.lockup'] = item.position;
          console.log('Migrating lockup on ' + page.slug);
        }
        return apos.pages.update({ _id: page._id }, { $set: set, $unset: unset }, callback);
      }, callback);
    };
  });

  return setImmediate(function() { return callback(null); });
}
