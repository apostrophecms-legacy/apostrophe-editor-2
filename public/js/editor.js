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

  var self = this;
  self.$el = $el;
  // So serialize can be invoked from the outside world
  self.$el.data('editor', self);
  self.options = JSON.parse(self.$el.attr('data-options'));
  var instances = {};

  self.init = function() {
    self.$el.on('click', '[data-add-item-type]', function() {
      var itemType = $(this).attr('data-add-item-type');

      // If this is not empty then we want to append the new item after this item.
      // If it is empty then we want to prepend it to the area (we used the content menu
      // at the top of the area, rather than one nested in an item).
      self.$insertItemContext = $(this).closest('.apos-item,.apos-lockup');

      // We may have come from a context content menu associated with a specific item;
      // if so dismiss it, but note we waited until after calling closest() to figure out
      // if the click came from such a menu
      self.dismissContextContentMenu();

      if (itemType === 'richText') {
        return self.addRichText();
      } else {
        return self.addWidget(itemType);
      }
    });

    self.$el.on('click', '[data-edit-item]', function(event) {
      var $item = $(this).closest('.apos-item');
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

    self.$el.on('click', '[data-rich-text]', function() {
      var $richText = $(this).closest('[data-rich-text]');
      return self.editRichText($richText);
    });

    self.$el.on('click', '[data-trash-item]', function() {
      var $item = $(this).closest('.apos-item,.apos-lockup');
      return self.trashItem($item);
    });

    self.$el.on('click', '[data-content-menu-toggle]', function() {
      var $contentMenu = $(this).closest('[data-content-menu]');
      if (self.$contextContentMenu && (self.$contextContentMenu[0] !== $contentMenu[0])) {
        self.dismissContextContentMenu();
      }
      $contentMenu.find('[data-content-menu-options]').toggle();
      self.$contextContentMenu = $contentMenu;
      return false;
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
      apos.log('dismiss...');
      if (self.$contextContentMenu) {
        apos.log('there is a menu...');
        // Permanent menus, like the one at the top of an area, will have
        // a data-content-menu-toggle element for showing and hiding their
        // options. These should be hidden when not needed. Other menus
        // were produced by clicking "add" and can be removed when not needed.
        if (self.$contextContentMenu.has('[data-content-menu-toggle]').length) {
          apos.log(self.$contextContentMenu[0]);
          apos.log('hiding...');
          self.$contextContentMenu.find('[data-content-menu-options]').hide();
        } else {
          self.$contextContentMenu.remove();
          delete self.$contextContentMenu;
        }
      }
    };

    self.addTopContentMenu(function() {
      self.addButtonsToExistingItems();
      self.$el.attr('data-initialized', 'true');
    });

    if (self.$el.is('[data-save]')) {
      // Self-saving. Used for areas on regular pages. Areas in snippets
      // will be queried for their content at the time the snippet is saved
      self.previousData = self.serialize();
      self.saveInterval = setInterval(self.saveIfNeeded, 5000);
      $(window).on('unload', function() {
        // If there are outstanding changes when the user leaves the page,
        // attempt a synchronous save operation so we have a chance to complete
        // before leaving
        self.saveIfNeeded(true);
      });
    }
  };

  self.editRichText = function($richText) {
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
      var instance = instances[id] = CKEDITOR.inline(id);
      // Why is this necessary? Without it we don't get focus. If we don't use a timeout
      // focus is stolen back. As it is we still lose our place in the text. ):
      setTimeout(function() {
        instance.focus();
      }, 100);
    });
    return false;
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
    self.$activeRichText = undefined;
    return callback();
  };

  // Fetch the content menu suited to this area. Make a copy for use as a
  // template to be copied if the "+" button is used to add content after an
  // individual item. Then prepend the original one as the main add content menu.
  self.addTopContentMenu = function(callback) {
    $.post(self.contentMenuUrl || '/apos-editor-2/content-menu',
      { controls: self.options.controls },
      function(data) {
      var $menu = $(data);
      self.$contentMenuTemplate = $menu.clone();
      self.$el.prepend($menu);
      return callback();
    });
  };

  // Decorate a new or existing apos-widget with a top bar of buttons suitable for whatever can be
  // done to it "in context" in the editor - at a minimum, opening the widget's dialog
  self.addButtonsToWidget = function($widget) {
    return self.addButtonsToItem($widget);
  };

  // We decorate widgets and texts the same way in this editor. This is also a good place
  // to make the item draggable. You may call this more than once to replace the buttons
  self.addButtonsToItem = function($item) {
    var $itemButtons;
    $item.find('.apos-editor2-item-buttons,.apos-editor2-locked-item-buttons').remove();

    // Items in a lockup get a restricted set of buttons. The rich text itself still
    // has all of them
    var isLocked = self.isItemLocked($item);
    if (self.isItemLocked($item)) {
      $itemButtons = apos.fromTemplate('.apos-editor2-locked-item-buttons');
    } else {
      $itemButtons = apos.fromTemplate('.apos-editor2-item-buttons');
    }
    $item.prepend($itemButtons);
    if (isLocked) {
      // If we let the text of a lockup be draggable and a widget is floated left
      // next to it, the widget will not be reachable by the mouse, so we don't permit
      // this. Instead you can get the items out again by breaking the lockup with its
      // "unlock" button
      if ($item.hasClass('ui-draggable')) {
        $item.draggable('destroy');
      }
    } else {
      $item.draggable(self.draggableSettings);
    }
  };

  // Add controls to a lockup, and make it draggable as appropriate
  self.addButtonsToLockup = function($lockup) {
    var $lockupButtons;
    $lockup.find('.apos-editor2-lockup-buttons :not(.apos-template)').remove();
    $lockupButtons = apos.fromTemplate('.apos-editor2-lockup-buttons');

    var $typeTemplate = $lockupButtons.find('[data-lockup-type]');
    var lockups = self.getLockupsForArea($lockup.closest('.apos-area'));
    var $previous = $typeTemplate;
    _.each(lockups, function(lockup, name) {
      var $button = apos.fromTemplate($typeTemplate);
      $button.text(lockup.label);
      // This would be a good place to add the icon instead
      $button.attr('data-lockup-type', name);
      $previous.after($button);
    });

    var type = self.getLockupType($lockup);
    $lockupButtons.find('[data-lockup-type="' + type + '"]').addClass('apos-active');

    $lockup.prepend($lockupButtons);
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
    $items = self.$el.find('.apos-item');
    $items.each(function() {
      var $item = $(this);
      self.addButtonsToItem($item);
    });
    $items = self.$el.find('.apos-lockup');
    $items.each(function() {
      var $item = $(this);
      self.addButtonsToLockup($item);
    });
  };

  // Insert a newly created apos-widget, typically called by the widget's editor on save
  self.insertWidget = function($widget) {
    // Newly created widgets need default position and size
    $widget.attr('data-position', 'middle');
    $widget.attr('data-size', 'full');
    $widget.addClass('apos-middle');
    $widget.addClass('apos-full');
    $widget.addClass('apos-item');
    self.insertItem($widget);
  };

  self.insertItem = function($item) {
    if (self.$insertItemContext && self.$insertItemContext.length) {
      self.$insertItemContext.after($item);
    } else {
      self.$el.find('.apos-normal-view .apos-content').prepend($item);
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
      if (($area[0] === $ancestor[0]) && (!$draggable.prev().length)) {
        return;
      }
      $area.find('.apos-normal-view .apos-content').prepend(self.newSeparator());
    });

    var $elements = $areas.find('.apos-item, .apos-lockup');
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
    $('[data-drag-item-separator]:not(.apos-template)').remove();
  };

  self.getDroppableAreas = function($draggable) {
    var betweenAreas = !$draggable.hasClass('apos-lockup');

    var $areas;
    if (betweenAreas) {
      $areas = $('.apos-area[data-editable]');
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
    $areas.find('.apos-content .apos-rich-text-item').each(function() {
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

  self.addRichText = function() {
    self.doneEditingRichText(function() {
      var $text = apos.fromTemplate('.apos-rich-text-item');
      self.addButtonsToItem($text);
      self.insertItem($text);
      self.editRichText($text.find('[data-rich-text]'));
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
        // Can't drag before or after itself
        // apos.log('start');
        self.enableDroppables($(event.target));
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
    apos.log('unlocking');
    var $items = $lockup.children('.apos-item');
    $items.each(function() {
      var $item = $(this);
      if ($item.hasClass('apos-widget')) {
        var data = self.getWidgetData($item);
        if (data.lockup) {
          delete data.lockup;
        }
        self.putWidgetData($item, data);
      }
    });
    $lockup.before($items);
    $lockup.remove();
    $items.each(function() {
      self.addButtonsToItem($(this));
    });
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
    $el.find('.apos-item').each(function() {
      var $item = $(this);
      var item;
      if ($item.hasClass('apos-widget')) {
        item = self.getWidgetData($item, true);
      } else if ($item.hasClass('apos-rich-text-item')) {
        item = {
          type: 'richText',
          content: $item.find('[data-rich-text]').html()
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
      apos.log('saving...');
      $.ajax({
        url: '/apos/edit-area',
        type: 'POST',
        data: {
          slug: self.$el.attr('data-slug'),
          options: JSON.stringify(self.getAreaOptions(self.$el)),
          content: JSON.stringify(data),
          async: !sync
        },
        success: function() {
          self.previousData = data;
          apos.log('saved');
        },
        error: function() {
          apos.log('save FAILED');
        }
      });
    }
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
  // For areas present at page load
  $('body').on('aposReady', function() {
    AposEditor2.enableAll();
  });
  // For areas added later, this event is individually triggered
  $('body').on('aposNewArea', function() {
    AposEditor2.enableAll();
  });
};

$(function() {
  AposEditor2.auto();
});

