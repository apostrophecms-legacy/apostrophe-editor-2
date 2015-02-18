/* global rangy, $, _, apos, alert, prompt, CKEDITOR */

// Replace the old Jot-based editor with one that is more A1.5-like while retaining
// all the advantages of A2.

function AposEditor2($el) {
  // Automatic inline use of ckeditor is not suitable as it can't handle AJAX,
  // making it unsuitable for our uses, and it interferes with explicit
  // ckeditor instantiation, the only workaround for the AJAX problem.
  //
  // So we have to globally shut this off if we are active at all. If you wish
  // to make direct use of ckeditor you must do it explicitly with
  // CKEDITOR.inline(id) like we do. Hey, it's not our fault.

  CKEDITOR.disableAutoInline = true;
  // This clears the auto-populated Title attribute CKEditor puts on stuff, makes for ugly tooltips
  CKEDITOR.on('instanceReady',function(event){$(event.editor.element.$).attr('title','');});

  CKEDITOR.plugins.addExternal('split', apos.data.prefix + '/modules/editor-2/js/ckeditorPlugins/split/', 'plugin.js');

  // This particular plugin has proven difficult for our users and therefore,
  // we're removing it for now. --Joel (joel@punkave.com)
  CKEDITOR.config.removePlugins = 'magicline';

  var self = this;
  self.$el = $el;

  // So we don't reinitialize it on every call to enableAll()
  self.$el.attr('data-initialized', 'true');

  // So serialize can be invoked from the outside world
  self.$el.data('editor', self);
  self.options = JSON.parse(self.$el.attr('data-options'));
  if (self.options.textOnly) {
    // So it can be easily excluded in selectors for drag and drop
    self.$el.attr('data-text-only', true);
  }
  var instances = {};

  // Selectors to locate items and lockups without crossing into
  // the rendered content of a widget such as the blog widget
  var selItems = '.apos-item:not(.apos-widget .apos-item)';
  var selLockups = '.apos-lockup:not(.apos-widget .apos-lockup)';

  self.init = function() {
    if (self.$el.find('.apos-content').html() === "") {
      self.$el.find('.apos-content').addClass('apos-empty');
    }
    self.$el.on('click', '[data-add-item-type]', function() {
      self.$el.find('.apos-content').removeClass('apos-empty');
      var itemType = $(this).attr('data-add-item-type');

      // If this is not empty then we want to append the new item after this item.
      // If it is empty then we want to prepend it to the area (we used the content menu
      // at the top of the area, rather than one nested in an item).
      self.$insertItemContext = $(this).closest('.apos-item,.apos-lockup');

      // We may have come from a context content menu associated with a specific item;
      // if so dismiss it, but note we waited until after calling closest() to figure out
      // if the click came from such a menu
      self.dismissContextContentMenu();

      // If there's any intial content items, remove them on selecting
      // your first widget. Right now, we're parsing the data-options through
      // self.options and using self.options.initialContent or what we think is
      // the default from aposLocals.

      self.removeInitialContent(self.$el, true);

      if (itemType === 'richText') {
        return self.addRichText();
      } else {
        return self.addWidget(itemType);
      }
    });

    self.$el.on('click', '[data-edit-item]', function(event) {
      var $item = $(this).closest('.apos-item, .apos-lockup');
      if ($item.hasClass('apos-lockup')) {
        $item = $item.find('.apos-rich-text-item');
      }
      if ($item.attr('data-type') === 'richText') {
        var $text = $item.find('[data-rich-text]');
        self.editRichText($text);
        // Follow that up with a focus call so ckeditor decides to show itself
        // if it is already present, but dormant. We don't have to or want to do
        // this on click events on the text so this code is specific to this button
        $text.focus();
        return false;
      } else if ($item.hasClass('apos-widget')) {
        self.editWidget($item);
        return false;
      }
    });


    self.$el.on('click', '[data-move-item]', function(e) {
      var $self = $(this);
      var $item = $self.closest('.apos-item, .apos-lockup');
      var direction = $self.attr('data-move-item');

      if (direction === 'up') {
        $item.prev().before($item);
      } else if (direction === 'down') {
        $item.next().after($item);
      } else if (direction === 'top') {
        $item.parent().children(':first').before($item);
      } else if (direction === 'bottom') {
        $item.parent().children(':last').after($item);
      }
    });


    // Switch a lockup between types (left, right, etc)
    self.$el.on('click', '[data-lockup-type]', function(event) {
      var type = $(this).attr('data-lockup-type');
      var $lockup = $(this).closest('.apos-lockup');
      var oldType = self.getLockupType($lockup);
      if (oldType !== type) {

        // The type of the lockup is actually stored as an attribute of
        // its widget
        var $widget = $lockup.find('.apos-widget');
        var data = self.getWidgetData($widget);
        data.lockup = type;
        self.putWidgetData($widget, data);

        // The lockup also gets a class
        $lockup.removeClass(oldType);
        $lockup.addClass(type);

        // Re-render the widget to reflect changes to things like
        // the size option of slideshows
        self.reRenderWidget($widget);

        // Show which option is currently active
        $lockup.find('[data-lockup-type]').removeClass('apos-active');
        $(this).addClass('apos-active');
      }
      return false;
    });

    self.$el.on('click', '[data-rich-text]:not(.apos-widget [data-rich-text])', function(event) {
      // Don't mess with links in the rich text, even editors need to be able to
      // follow links sometimes. They can use the pencil if the entire text
      // is a link
      var $richText = $(this);
      var $link = $(event.target).closest('a');
      if ($link.length) {
        var state = $richText.data('aposState');
        if (!state) {
          // Block the Apostrophe click-to-edit behavior, let the link work normally
          return true;
        }
        if (state === 'focused') {
          // There is already a focused ckeditor instance, so let it
          // handle the click
          return true;
        }
        if (state === 'blurred') {
          // There is an unfocused ckeditor instance, aggressively
          // force the link to work instead of the ckeditor click-to-edit behavior
          window.location.href = $link.attr('href');
          return false;
        }
      }
      // Not a link, not already an editor instance, start the editor
      return self.editRichText($(this));
    });

    self.$el.on('click', '[data-trash-item]', function() {
      var $item = $(this).closest('.apos-item,.apos-lockup');
      return self.trashItem($item);
    });

    self.$el.on('click', '[data-content-menu-toggle]', function() {
      if ($(this).hasClass('apos-disabled')) {
        // Limit reached
        return false;
      }
      var $contentMenu = $(this).closest('[data-content-menu]');
      if ($contentMenu.hasClass('apos-open')) {
        $contentMenu.removeClass('apos-open');
        delete self.$contextContentMenu;
        return;
      }
      $('body').trigger('aposCloseMenus');
      $contentMenu.addClass('apos-open');
      self.$contextContentMenu = $contentMenu;
      return false;
    });

    $('body').on('aposCloseMenus', function() {
      self.dismissContextContentMenu();
    });

    self.$el.on('click', '[data-add-item]', function() {
      var $item = $(this).closest('.apos-item,.apos-lockup');

      // If the user clicks add and our menu was already up, just take it down
      // and return
      if (self.$contextContentMenu) {
        var $itemOfMenu = self.$contextContentMenu.closest('.apos-item,.apos-lockup');
        if ($itemOfMenu[0] === $item[0]) {
          self.dismissContextContentMenu();
          return;
        }
      }

      // Make sure any previous menu is dismissed
      self.dismissContextContentMenu();
      self.$contextContentMenu = self.$contentMenuTemplate.clone();
      // The toggle is redundant when we use the add button
      self.$contextContentMenu.find('[data-content-menu-toggle]').remove();
      self.$contextContentMenu.find('[data-content-menu-options]').show();
      $item.find('.apos-editor2-item-buttons').after(self.$contextContentMenu);
      return false;
    });

    self.$el.on('click', '[data-unlock-item]', function() {
      var $lockup = $(this).closest('.apos-lockup');
      return self.unlock($lockup);
    });

    // Any "outside" click should dismiss the "add content" menu.
    self.$el.on('click', function() {
      self.dismissContextContentMenu();
      return true;
    });

    self.dismissContextContentMenu = function() {
      if (self.$contextContentMenu) {
        // Permanent menus, like the one at the top of an area, will have
        // a data-content-menu-toggle element for showing and hiding their
        // options. These should be hidden when not needed. Other menus
        // were produced by clicking "add" and can be removed when not needed.
        if (self.$contextContentMenu.has('[data-content-menu-toggle]').length) {
          self.$contextContentMenu.toggleClass('apos-open', false);
        } else {
          //self.$contextContentMenu.toggleClass('apos-open', false);
          self.$contextContentMenu.remove();
          delete self.$contextContentMenu;
        }
      }
    };

    self.linkItemsToAreaEditor();

    // Should we bring async into browserland? This would be more elegant if we did
    if (!self.options.textOnly) {
      self.addTopContentMenu(addButtons);
    } else {
      addButtons();
    }

    function addButtons() {
      self.addButtonsToExistingItems();
      self.respectLimit();
    }

    if (self.$el.is('[data-save]')) {
      // Self-saving. Used for areas on regular pages. Areas in snippets
      // will be queried for their content at the time the snippet is saved
      self.previousData = self.serialize();
      self.saveInterval = setInterval(self.saveIfNeeded, 5000);
      $(window).on('beforeunload', function() {
        // If there are outstanding changes when the user leaves the page,
        // attempt a synchronous save operation so we have a chance to complete
        // before leaving
        self.saveIfNeeded(true);
      });
    }

    // In text-only mode make sure there is a text to edit
    if (self.options.textOnly && (!self.$el.find(selItems).length)) {
      return self.addRichText();
    }
  };

  self.linkItemsToAreaEditor = function() {
    // Every item should know its area editor so we can talk
    // to other area editors after drag-and-drop
    var $items = self.$el.find(selItems);
    $items.each(function() {
      var $item = $(this);
      $item.data('areaEditor', self);
    });
  };

  self.editRichText = function($richText) {
    // Remove any initial "click to type" content when we
    // start actual editing
    self.removeInitialContent(self.$el);

    if (self.$activeRichText && ($richText.attr('id') === self.$activeRichText.attr('id'))) {
      // Don't interfere with clicks on the current editor
      return true;
    }

    self.doneEditingRichText(function() {

      self.$activeRichText = $richText;
      var id = $richText.attr('id');
      if (!id) {
        // Must have one for ckeditor
        id = apos.generateId();
        $richText.attr('id', id);
      }
      $richText.attr('contenteditable', 'true');
      var toolbar = [];



      // Translate classic A2 control names to ckeditor control names.
      // You can also use native ckeditor control names. A good reference
      // is tough to find, but see: http://ckeditor.com/forums/CKEditor/Complete-list-of-toolbar-items

      var a2ToCkControls = {
        'style': 'Styles',
        'bold': 'Bold',
        'italic': 'Italic',
        'createLink': 'Link',
        'unlink': 'Unlink',
        'insertUnorderedList': 'BulletedList',
        'insertNumberedList': 'NumberedList',
        'insertTable': 'Table'
      };

      // Accept universal A2 or ckeditor-specific styleset definition.
      // We don't allow attributes or CSS styles here because A2's
      // philosophy calls for styling simple elements to suit the project
      // and filtering all markup server-side to remove any unwanted
      // CSS inconsistent with the project's style guide.

      var styles = _.map(self.options.styles, function(style) {
        return {
          name: style.name || style.label,
          element: style.element || style.value,
          // This will not work the way you expect unless you allow
          // the relevant attributes in your sanitizeHtml configuration
          // in app.js
          styles: style.styles,
          attributes: style.attributes
        };
      });

      // Allow both universal A2 and ckeditor-specific controls in the toolbar.
      // Don't worry about widgets, those are presented separately.

      _.each(self.options.controls, function(control) {
        if (!apos.widgetTypes[control]) {
          if (a2ToCkControls[control]) {
            toolbar.push(a2ToCkControls[control]);
          } else {
            toolbar.push(control);
          }
          if (control === 'createLink') {
            // The classic A2 editor offers both anchor and regular links in a
            // single dialog, so make sure that in addition to Link, we also
            // offer ckeditor's Anchor
            //
            // TODO: why won't this work?
            toolbar.push('Anchor');
          }
        }
      });

      // This will allow loading of extra plugins for each editor
      var extraPlugins = [ 'split' ];
      _.each([].concat(apos.data.editor2.plugins, self.options.plugins || []), function(widget) {
        if (widget.path) {
          var plugin = CKEDITOR.plugins.get(widget.name);
          if (!plugin) {
            CKEDITOR.plugins.addExternal(widget.name, widget.path);
          }
        }
        extraPlugins.push(widget.name || widget);
      });
      extraPlugins = extraPlugins.join(',');

      var config = {
        extraPlugins: extraPlugins,
        toolbar: [ toolbar ],
        stylesSet: styles,
        on: {
          // TODO these event handlers should check whether the ckeditor instance
          // really belongs to apostrophe and play nice if not
          pluginsLoaded: function(evt) {
            var cmd = evt.editor.getCommand('table');
            // Don't allow table elements, properties and styles that
            // complicate responsive design
            cmd.allowedContent = 'table tr th td';
          },
          instanceReady: function(ck) {
            ck.editor.a2Area = self;
            ck.editor.$a2Item = $richText.closest('.apos-item');
            ck.editor.removeMenuItem('tablecellproperties');
          }
        }
      };

      if (!toolbar.length) {
        config.removePlugins = 'toolbar';
      }

      var instance = instances[id] = CKEDITOR.inline(id, config);
      var itemActions = $(instance.element.$).parent().find('.apos-item-actions');

      instance.on('focus', function(){
        itemActions.hide();
        $richText.data('aposState', 'focused');
      });

      instance.on('blur', function(){
        itemActions.show();
        // On blur kill the editor so we can click on links in the text again
        self.doneEditingRichText(function() {});
        $richText.data('aposState', 'blurred');
        // stuart
        var html = $richText.html();
        if (html.length !== 0) {
          $richText.parents('[data-type="richText"]').removeClass('apos-empty');
        } else {
          $richText.parents('[data-type="richText"]').toggleClass('apos-empty', true);
        }
        apos.emit('editorBlurred');
      });

      // Why is this necessary? Without it we don't get focus. If we don't use a timeout
      // focus is stolen back. As it is we still lose our place in the text. ):
      setTimeout(function() {
        // This should not be necessary, but without the &nbsp; we are unable to
        // focus on an "empty" rich text after first clicking away an then clicking back.
        // And without the call to focus() people have to double click for no
        // apparent reason
        if ($richText.html() === "" || $richText.html() === ' ') {
          $richText.html('<div>&nbsp;</div>');
        }
        instance.focus();
      }, 100);

    });
    return false;
  };

  self.removeInitialContent = function($el, entireItem) {
    if (entireItem) {
      // We added a real item to an area that only contains a
      // placeholder item which should be removed in its entirety
      $el.find('.apos-rich-text-item:has([data-initial-content])').remove();
    } else {
      // We started editing such an item. Don't trash it,
      // just remove the initial content <p> tag
      $el.find('[data-initial-content]').remove();
    }
  };

  self.doneEditingRichText = function(callback) {
    if (!self.$activeRichText) {
      return callback();
    }

    var id = self.$activeRichText.attr('id');
    var instance = instances[id];
    var data = instance.getData();
    instance.destroy();
    delete instances[id];
    self.$activeRichText.removeAttr('contenteditable');
    self.$activeRichText.html(data);
    self.$activeRichText.data('aposState', undefined);
    self.$activeRichText = undefined;
    return callback();
  };

  // Fetch the content menu suited to this area. Make a copy for use as a
  // template to be copied if the "+" button is used to add content after an
  // individual item. Then prepend the original one as the main add content menu.
  self.addTopContentMenu = function(callback) {
    $.post(self.contentMenuUrl || '/apos-editor-2/content-menu',
      { controls: self.options.controls, richText: self.options.richText, addLabel: self.options.addLabel },
      function(data) {
      var $menu = $(data);
      self.$contentMenuTemplate = $menu.clone();
      self.$el.prepend($menu);
      apos.emit('contentMenuReady');
      return callback();
    });
  };

  // Decorate a new or existing apos-widget with a top bar of buttons suitable for whatever can be
  // done to it "in context" in the editor - at a minimum, opening the widget's dialog
  self.addButtonsToWidget = function($widget) {
    self.addButtonsToItem($widget);
  };

  // We decorate widgets and texts the same way in this editor. This is also a good place
  // to make the item draggable. You may call this more than once to replace the buttons
  self.addButtonsToItem = function($item) {
    var $itemButtons;
    $item.find('.apos-editor2-item-buttons,.apos-editor2-locked-item-buttons').remove();

    // Items in a lockup get a restricted set of buttons. The rich text itself still
    // has all of them
    var isLocked = self.isItemLocked($item);
    if (self.isItemLocked($item) && !$item.hasClass('apos-widget')) {
      $itemButtons = apos.fromTemplate('.apos-editor2-locked-item-buttons');
    } else if (self.isItemLocked($item)) {
      $itemButtons = apos.fromTemplate('.apos-editor2-lockup-widget-buttons');
    } else {
      $itemButtons = apos.fromTemplate('.apos-editor2-item-buttons');
    }

    $item.prepend($itemButtons);

    // Horizontally center a locked widget w/ unknown height
    if ($item.find('.apos-ui-container').hasClass('center')) {
      var buttonsWidth = $item.find('.apos-ui-container').width();
      var widgetWidth = $item.width();
      var left = (widgetWidth / 2) - (buttonsWidth / 2);
      $item.find('.center').css('left', left + 'px');
    }

    if (isLocked) {
      // If we let the text of a lockup be draggable and a widget is floated left
      // next to it, the widget will not be reachable by the mouse, so we don't permit
      // this. Instead you can get the items out again by breaking the lockup with its
      // "unlock" button
      if ($item.hasClass('ui-draggable')) {
        // Do this after yield to avoid a crash in jquery UI
        apos.afterYield(function() {
          $item.draggable('destroy');
        });
      }
    } else {
      $item.draggable(self.draggableSettings);
    }
    if (self.options.textOnly) {
      $item.find('[data-drag-item]').remove();
      $item.find('[data-add-item]').remove();
      $item.find('[data-trash-item]').remove();
    }
  };

  // Add controls to a lockup, and make it draggable as appropriate
  self.addButtonsToLockup = function($lockup) {
    var $lockupButtons;
    $lockup.find('.apos-editor2-locked-item-buttons:not(.apos-template)').remove();
    $lockupButtons = apos.fromTemplate('.apos-editor2-locked-item-buttons');
    // $lockupButtons = apos.fromTemplate('.apos-editor2-lockup-buttons');

    var $typeTemplate = $lockupButtons.find('[data-lockup-type]');
    var lockups = self.getLockupsForArea($lockup.closest('.apos-area'));
    if (lockups) {
      $lockup.closest('.apos-area').find('[data-lockups-menu]').removeClass('apos-template');
    }
    var $previous = $typeTemplate;
    _.each(lockups, function(lockup, name) {
      var $button = apos.fromTemplate($typeTemplate);
      if (lockup.tooltip) {
        $button.attr('title', lockup.tooltip);
      } else {
        $button.attr('title', lockup.label);
      }
      if (lockup.icon) {
        $button.find('i').attr('class', lockup.icon);
      }

      $button.append(lockup.label);

      $button.attr('data-lockup-type', name);
      $previous.after($button);
    });
    $typeTemplate.remove();

    var type = self.getLockupType($lockup);
    $lockupButtons.find('[data-lockup-type="' + type + '"]').addClass('apos-active');

    $lockup.prepend($lockupButtons);

    $lockup.find('[data-content-menu-toggle]').click(function(e) {
      $(this).next().toggleClass('apos-active');
    });
    $lockup.draggable(self.draggableSettings);
  };

  self.isItemLocked = function($item) {
    var $lockup = $item.parent('.apos-lockup');
    return !!$lockup.length;
  };

  // Decorate the existing items with buttons, create the separators, and
  // make the rich text items droppable
  self.addButtonsToExistingItems = function() {
    var $items;
    // Use the :not selector to avoid recursing into widgets that include
    // areas in their rendered output
    $items = self.$el.find(selItems);
    $items.each(function() {
      var $item = $(this);
      self.addButtonsToItem($item);
    });
    $items = self.$el.find(selLockups);
    $items.each(function() {
      var $item = $(this);
      self.addButtonsToLockup($item);
    });
  };

  // Insert a newly created apos-widget, typically called by the
  // widget's editor on save of a new widget

  self.insertWidget = function($widget) {
    $widget.addClass('apos-item');
    self.addButtonsToWidget($widget);
    self.insertItem($widget);
    self.respectLimit();
  };

  // Replace an existing widget, preserving any classes and
  // attributes specific to the area editor, like lockups. Typically
  // called by the widget's editor on save, so it can change
  // attributes of the widget element itself

  self.replaceWidget = function($old, $widget) {
    var data = self.getWidgetData($old);
    var lockup = data.lockup;
    self.addButtonsToWidget($widget);
    data = self.getWidgetData($widget);
    data.lockup = lockup;
    self.putWidgetData($widget, data);
    $old.replaceWith($widget);
  };

  self.insertItem = function($item) {
    $item.data('areaEditor', self);
    if (self.$insertItemContext && self.$insertItemContext.length) {
      self.$insertItemContext.after($item);
    } else {
      self.$el.find('.apos-normal-view .apos-content:first').prepend($item);
    }
  };

  // This method recreates separators throughout the entire page as appropriate
  // to the element being dragged.
  self.addSeparators = function($draggable) {
    var $areas = self.getDroppableAreas($draggable);
    // Drop zone at the top of every area, unless we are dragging the top item
    // in that particular area


    $areas.each(function() {
      var $area = $(this);
      var $ancestor = $draggable.closest('.apos-area[data-editable]');
      $area.addClass('apos-dragging');

      if (($area[0] === $ancestor[0]) && (!$draggable.prev().length)) {
        return;
      }

      $area.find('.apos-normal-view .apos-content:first').prepend(self.newSeparator());
    });

    var $elements = $areas.find(selItems + ',' + selLockups);
    $(window).trigger('apos-dragging', [$elements]);
    // Counter so we can peek ahead
    var i = 0;
    $elements.each(function() {
      var $element = $(this);
      var good = true;
      // Individual items inside lockups don't get dropzones above and below them
      if ($element.parent('.apos-lockup').length) {
        good = false;
        // There should be no dropzone immediately below or above the element
        // being dragged
      } else if (($elements[i] === $draggable[0]) || (((i + 1) < $elements.length) && ($elements[i + 1] === $draggable[0]))) {
        good = false;
      }
      if (good) {
        $element.after(self.newSeparator());
      }
      i++;
    });
    $('[data-drag-item-separator]:not(.apos-template)').droppable(self.separatorDropSettings);
  };

  self.removeSeparators = function() {
    $(window).trigger('apos-stop-dragging');
    $('.apos-area').removeClass('apos-dragging');
    $('[data-drag-item-separator]:not(.apos-template)').remove();
  };

  self.getDroppableAreas = function($draggable) {
    var richText;
    if ($draggable.hasClass('apos-rich-text-item')) {
      richText = true;
    }
    // Lockups can only be dragged within the current area
    var betweenAreas = !$draggable.hasClass('apos-lockup');
    var $areas;
    if (betweenAreas) {
      // Only the current area, and areas that are not full; also
      // rule out areas that do not allow the widget type in question
      $areas = $('.apos-area[data-editable]:not([data-text-only])').filter(function() {
        var editor = $(this).data('editor');
        if ((!editor.limitReached()) || ($draggable.data('areaEditor') === editor)) {
          if ((richText && (editor.options.richText !== false)) || _.contains(editor.options.controls, $draggable.attr('data-type'))) {
            return true;
          }
        }
      });
    } else {
      $areas = $draggable.closest('.apos-area[data-editable]');
    }
    return $areas;
  };

  self.newSeparator = function() {
    var $separator = apos.fromTemplate('.apos-editor2-item-separator');
    return $separator;
  };

  self.enableDropOnText = function($draggable) {
    var $areas = self.getDroppableAreas($draggable);
    $areas.find(".apos-content .apos-rich-text-item:not('.apos-widget .apos-rich-text-item')").each(function() {
      var $item = $(this);
      // What we accept depends on which lockups allow which widgets. We can
      // automatically switch lockups if one lockup supports widget A and the
      // other supports widget B
      var type = $draggable.attr('data-type');
      var good = false;
      if (type === 'richText') {
        // Great, always acceptable to drag to other text
        good = true;
      } else {
        var areaOptions = self.getAreaOptions($item.closest('.apos-area[data-editable]'));
        if (!areaOptions.lockups) {
          // No lockups at all - text is a drag target only for other text
        } else {
          var lockupWidgetTypes = [];
          _.some(areaOptions.lockups, function(lockupName) {
            var lockup = apos.data.lockups[lockupName];
            if (lockup && _.contains(lockup.widgets, type)) {
              good = true;
              return true;
            }
          });
        }
      }
      if (good) {
        $item.droppable(self.richTextDropSettings);
      }
    });
  };

  self.disableDropOnText = function() {
    $('.apos-area[data-editable] .apos-content .apos-item.apos-rich-text').droppable('destroy');
  };

  self.getAreaOptions = function($area) {
    // TODO: this could be a lot of parsing done over and over
    return JSON.parse($area.attr('data-options') || '{}');
  };

  self.editWidget = function($widget) {
    return self.doneEditingRichText(function() {
      var widgetType = $widget.attr('data-type');
      var widgetId = $widget.attr('data-id');
      var options = self.options[widgetType] || {};
      try {
        var widgetEditor = new apos.widgetTypes[widgetType].editor({
          editor: self,
          $widget: $widget,
          options: options
        });
        widgetEditor.init();
      } catch (e) {
        apos.log('Error initializing widget of type ' + widgetType);
        throw e;
      }
    });
  };

  self.addRichText = function(html, editNow) {
    self.doneEditingRichText(function() {
      var $text = apos.fromTemplate('.apos-rich-text-item');
      self.addButtonsToItem($text);
      self.insertItem($text);
      if (html !== undefined) {
        $text.find('[data-rich-text]').html(html);
      }
      if (editNow || (editNow === undefined)) {
        self.editRichText($text.find('[data-rich-text]'));
      }
      self.respectLimit();
    });
    return false;
  };

  self.checkEmptyAreas = function() {
    $('.apos-area[data-editable]').each(function() {
      var $el = $(this);
      if ($el.find('[data-type]').length === 0) {
        $el.find('.apos-content').addClass('apos-empty');
      }
    });
    return false;
  };

  self.addWidget = function(type) {
    self.doneEditingRichText(function() {
      var options = self.options[type] || {};
      var widgetEditor = new apos.widgetTypes[type].editor({ editor: self, options: options });
      widgetEditor.init();
    });
    return false;
  };

  self.trashItem = function($item) {
    self.doneEditingRichText(function() {
      self.unlock($item);
      $item.remove();
      self.checkEmptyAreas();
      self.respectLimit();
    });
    return false;
  };

  self.draggableSettings = {
    handle: '[data-drag-item]',
    revert: 'invalid',
    refreshPositions: true,
    tolerance: 'pointer',
    start: function(event, ui) {
      self.doneEditingRichText(function() {
        // If the limit has been reached, we can only accept
        // drags from the same area
        var $item = $(event.target);
        self.enableDroppables($item);
      });
    },
    stop: function(event, ui) {
      self.disableDroppables();
    }
  };

  self.enableDroppables = function($draggable) {
    self.addSeparators($draggable);
    self.enableDropOnText($draggable);
  };

  self.disableDroppables = function($draggable) {
    self.removeSeparators();
    self.disableDropOnText();
  };

  self.separatorDropSettings = {
    accept: '.apos-item,.apos-lockup',
    activeClass: 'apos-editor2-active',
    hoverClass: 'apos-editor2-hover',
    tolerance: 'pointer',

    drop: function(event, ui) {
      // TODO: after the drop we should re-render the dropped item to
      // reflect the options of its new parent area
      var $item = $(ui.draggable);
      // If it's not a lockup itself, dragging it somewhere else automatically busts it out
      // of any lockup it may currently be in
      if (!$item.hasClass('apos-lockup')) {
        self.unlock($item);
      }
      // Get rid of the hardcoded position provided by jquery UI draggable,
      // but don't remove the position: relative without which we can't see the
      // element move when we try to drag it again later
      $item.css('top', '0');
      $item.css('left', '0');
      $(event.target).after($item);
      self.disableDroppables();
      if ($item.hasClass('apos-widget')) {
        self.reRenderWidget($item);
      }
      self.changeOwners($item);
    }
  };

  self.richTextDropSettings = {
    accept: '.apos-item',
    activeClass: 'apos-editor2-active',
    hoverClass: 'apos-editor2-hover',
    tolerance: 'pointer',

    drop: function(event, ui) {
      if (ui.draggable.hasClass('apos-widget')) {
        // TODO: after the drop we should re-render both the widget and the
        // target text to reflect the options of the area and the lockup, if any

        // Widget dragged to text - create a lockup
        var $newWidget = $(ui.draggable);
        var $richTextItem = $(event.target);
        // If the rich text is already part of a lockup, undo that
        self.unlock($richTextItem);
        // Create a lockup containing this text and this widget
        var $lockup = $('<div class="apos-lockup"></div>');
        // use the first lockup allowed in this area which is compatible
        // with the widget type
        var type = $newWidget.attr('data-type');
        var lockups = self.getLockupsForArea($richTextItem.closest('.apos-area[data-editable]'));
        // Should always be defined because we check for this when enabling droppables
        var key;
        var lockupName;
        for (key in lockups) {
          var lockup = lockups[key];
          if (_.contains(lockup.widgets, type)) {
            lockupName = key;
            break;
          }
        }
        if (lockupName) {
          $lockup.addClass(lockupName);
        }
        // Position the lockup where the text was, then move the widget and text into it
        $richTextItem.before($lockup);
        $lockup.append($newWidget);
        $lockup.append($richTextItem);
        // Redecorate the items to account for the fact that they are now stuck in a lockup
        self.addButtonsToItem($newWidget);
        self.addButtonsToItem($richTextItem);
        // Otherwise it stays offset where dropped
        $newWidget.removeAttr('style');
        var data = self.getWidgetData($newWidget);
        data.lockup = lockupName;
        self.putWidgetData($newWidget, data);
        self.reRenderWidget($newWidget);
        self.addButtonsToLockup($lockup);
      } else {
        // Text dragged to text - append the text
        var $contents = $(ui.draggable).find('[data-rich-text]').contents();
        $(event.target).find('[data-rich-text]').append($contents);
        $(ui.draggable).remove();
      }
      self.disableDroppables();
      // $item is not defined here, get the item from the event
      self.changeOwners($(ui.draggable));
    }
  };

  self.getLockupsForArea = function($area) {
    var options = self.getAreaOptions($area);
    var names = options.lockups || [];
    var lockups = {};
    _.each(names, function(name) {
      if (_.has(apos.data.lockups, name)) {
        lockups[name] = apos.data.lockups[name];
      }
    });
    return lockups;
  };

  self.getLockupType = function($lockup) {
    var $widget = $lockup.find('.apos-widget');
    var data = self.getWidgetData($widget);
    return data.lockup;
  };

  // Given an item that may be part of a lockup, bust it and its
  // peers, if any, out of the lockup so they can be dragged separately again
  self.unlock = function($item) {
    var $lockup;
    if ($item.hasClass('apos-lockup')) {
      $lockup = $item;
    } else {
      $lockup = $item.parent('.apos-lockup');
      if (!$lockup.length) {
        return;
      }
    }
    var $items = $lockup.children('.apos-item');
    $items.each(function() {
      var $item = $(this);
      if ($item.hasClass('apos-widget')) {
        var data = self.getWidgetData($item);
        if (data.lockup) {
          delete data.lockup;
        }
        self.putWidgetData($item, data);
        self.reRenderWidget($item);
      }
    });
    $lockup.before($items);
    $lockup.remove();
    $items.each(function() {
      self.addButtonsToItem($(this));
    });
    // Actually, we may already be over the limit at this point,
    // but we give the user until they leave the page to do
    // something about that (TODO: a visual indication that their
    // content is in peril would be best).
    self.respectLimit();
  };

  // Get the server to re-render a widget for us, applying the
  // options appropriate to its new context at area and possibly lockup level
  // TODO: we should prevent input during this time
  self.reRenderWidget = function($widget) {
    var options = self.getWidgetOptions($widget);
    var data = { _options: options };
    $.extend(true, data, self.getWidgetData($widget, true));
    return $.ajax({
      type: 'POST',
      url: '/apos/render-widget?bodyOnly=1&editView=1',
      processData: false,
      contentType: 'application/json',
      data: JSON.stringify(data),
      dataType: 'html',
      success: function(html) {
        $widget.html(html);
        var type = $widget.attr('data-type');
        if (apos.widgetPlayers[type]) {
          apos.widgetPlayers[type]($widget);
        }
        self.addButtonsToWidget($widget);
      }
    });
  };

  // Get the data associated with the widget, including the content property if
  // this type of widget has content stored as markup
  self.getWidgetData = function($widget, withContent) {
    var data = JSON.parse($widget.attr('data') || '{}');
    if (withContent) {
      var type = apos.widgetTypes[$widget.attr('data-type')];
      if (type && type.content) {
        if (type.content) {
          if (type.contentSelector) {
            data.content = $widget.find(type.contentSelector).text();
          } else {
            data.content = $widget.text();
          }
        }
      }
    }
    return data;
  };

  self.putWidgetData = function($widget, data) {
    $widget.attr('data', JSON.stringify(data));
  };

  // Get the options that apply to the widget in its current context
  // (area and possibly lockup)
  self.getWidgetOptions = function($widget) {
    var $area = $widget.closest('.apos-area[data-editable]');
    var data = self.getWidgetData($widget);
    var options = {};
    var areaOptions = self.getAreaOptions($area);
    var type = $widget.attr('data-type');
    if (areaOptions) {
      $.extend(true, options, areaOptions[type] || {});
    }
    if (data.lockup) {
      var lockupOptions = apos.data.lockups[data.lockup];
      $.extend(true, options, lockupOptions[type] || {});
    }
    return options;
  };

  // Serialize the editor to an array of items, exactly as expected for
  // storage in an area.
  self.serialize = function() {
    var items = [];
    $el.find(selItems).each(function() {
      var $item = $(this);
      var item;
      if ($item.hasClass('apos-widget')) {
        item = self.getWidgetData($item, true);
      } else if ($item.hasClass('apos-rich-text-item')) {
        var $text = $item.find('[data-rich-text]');
        // If it's an active contenteditable, use getData() to
        // give ckeditor a chance to clean it up
        var id = $text.attr('id');
        var data;
        if (id) {
          var instance = instances[id];
          if (instance) {
            data = instance.getData();
          }
        }
        if (!data) {
          data = $item.find('[data-rich-text]').html();
        }
        item = {
          type: 'richText',
          content: data
        };
      } else {
        apos.log('AposEditor2: unknown item type in serialize');
        return;
      }
      // Do not attempt to save dynamic properties
      var keys = _.keys(item);
      _.each(keys, function(key) {
        if (key.substr(0, 1) === '_') {
          delete item[key];
        }
      });
      items.push(item);
    });
    return items;
  };

  self.saveIfNeeded = function(sync) {
    // Die gracefully if the area has been removed from the DOM
    if (!self.$el.closest('body').length) {
      clearInterval(self.saveInterval);
      return;
    }
    var data = self.serialize();
    if (JSON.stringify(data) !== JSON.stringify(self.previousData)) {
      $.jsonCall(
        '/apos/edit-area',
        {
          async: !sync,
          dataType: 'html'
        },
        {
          slug: self.$el.attr('data-slug'),
          options: self.getAreaOptions(self.$el),
          content: data
        },
        function() {
          self.previousData = data;
          apos.emit('edited', self.$el);
        },
        function() {
          apos.log('save FAILED');
        }
      );
    }
    self.checkEmptyAreas();
  };

  // Take an item that might belong to a different
  // area and make it ours
  self.changeOwners = function($item) {
    $item.data('areaEditor').respectLimit();
    $item.data('areaEditor', self);
    self.respectLimit();
  };

  self.respectLimit = function() {
    var count = self.$el.find(selItems).length;
    var $toggles = self.$el.find('[data-content-menu-toggle]');
    if (self.limitReached()) {
      $toggles.addClass('apos-disabled');
    } else {
      $toggles.removeClass('apos-disabled');
    }
  };

  self.limitReached = function() {
    var count = self.$el.find(selItems).length;
    return (self.options.limit && (count >= self.options.limit));
  };
}

AposEditor2.enableAll = function() {
  $('.apos-area[data-editable]').each(function() {
    var $el = $(this);
    if ($el.attr('data-initialized')) {
      return;
    }
    var instance = new AposEditor2($el, true);
    instance.init();
  });
};

AposEditor2.auto = function() {
  // Enable areas in the main content of the page
  apos.on('ready', function() {
    AposEditor2.enableAll();
  });
  // An area was introduced via the admin UI, eg the body area of an event
  apos.on('newArea', function() {
    AposEditor2.enableAll();
  });

  // listen for shiftActive for power up/down nudge
  apos.on('shiftDown', function() {
    $('[data-move-item]').each(function() {
      $self = $(this);
      if ($self.attr('data-move-item') === 'up') {
        $self.children('i').toggleClass('icon-double-angle-up');
        $self.attr('data-move-item', 'top');
      } else if ($self.attr('data-move-item') === 'down') {
        $self.children('i').toggleClass('icon-double-angle-down');
        $self.attr('data-move-item', 'bottom');
      }
    });
  });

  apos.on('shiftUp', function() {
    $('[data-move-item]').each(function() {
      $self = $(this);
      $self.children('i').removeClass('icon-double-angle-up');
      $self.children('i').removeClass('icon-double-angle-down');
      if ($self.attr('data-move-item') === 'top') {
        $self.attr('data-move-item', 'up');
      } else if ($self.attr('data-move-item') === 'bottom') {
        $self.attr('data-move-item', 'down');
      }
    });
  });
};

$(function() {
  // Note we do this at DOMready, so if you want to hack it for some reason,
  // you have time to monkeypatch before it is invoked
  AposEditor2.auto();

});
