CKEDITOR.plugins.add( 'split', {
    icons: 'split',
    init: function(editor) {
      // The command that does what we want
      editor.addCommand('split', new CKEDITOR.command(editor, {
        exec: function(editor) {
          if (editor.a2Area.limitReached()) {
            // Refuse to play if we'd exceed the limit on items in this
            // area, we don't want to lose content
            return;
          }
          var sel = editor.getSelection();
          var ranges = sel.getRanges();
          var range = ranges[0];
          var range1 = editor.createRange();
          range1.selectNodeContents(editor.editable());
          range1.setEnd(range.startContainer, range.startOffset);
          var range2 = editor.createRange();
          range2.selectNodeContents(editor.editable());
          range2.setStart(range.startContainer, range.startOffset);
          var html1 = getHtmlForRange(range1);
          var html2 = getHtmlForRange(range2);

          apos.afterYield(function() {
            editor.a2Area.$insertItemContext = editor.$a2Item;
            // So they wind up in the right order - inserts push down
            editor.a2Area.addRichText(html2, false);
            editor.a2Area.addRichText(html1, false);
            apos.afterYield(function() {
              editor.a2Area.trashItem(editor.$a2Item);
            });
          });

          // Translate a range into markup, taking into account nasty
          // little details like startOffset and endOffset

          function getHtmlForRange(range) {

            // ckeditor's DOM walker class doesn't quite work for me.
            // It is very difficult to close the tags that have been
            // opened along the way. It's not clear why the guard function
            // is called for some tags and not others. I punted and
            // walked the DOM myself, although I still used CKEditor's
            // wrapper for the DOM. The end result appears correct
            // for all situations, including splitting in the middle
            // of a sentence and/or when multiple tags are open. -Tom

            var html = '';
            var node = range.startContainer;

            var parent = node;

            // Open the ancestors of startContainer, stopping
            // at the container
            while (parent && (!isContainer(parent))) {
              if (isElement(parent)) {
                // Prepend so the outermost one comes first
                html = openNode(parent) + html;
              }
              parent = parent.getParent();
            }

            var first = true;
            while (node) {
              if (isElement(node)) {
                if (!first) {
                  // first node is already open via
                  // loop above
                  html += openNode(node);
                }
              } else {
                var text = node.getText();
                var start = 0;
                var end = text.length;
                if (node.equals(range.startContainer)) {
                  start = range.startOffset;
                }
                if (node.equals(range.endContainer)) {
                  end = range.endOffset;
                }
                html += apos.escapeHtml(text.substring(start, end));
              }
              first = false;
              node = nextDepthFirst(node);
            }

            // Close the endContainer and its ancestors, stopping
            // at the main container
            parent = range.endContainer;

            while (parent && (!isContainer(parent))) {
              if (isElement(parent)) {
                // Prepend so the outermost one comes first
                html = html + closeNode(parent);
              }
              parent = parent.getParent();
            }

            function nextDepthFirst(node) {
              if (isElement(node) && node.getChild(0)) {
                return node.getChild(0);
              }
              while (true) {
                // When we exhaust the descendants of the endContainer,
                // we're done
                if (node.equals(range.endContainer)) {
                  return null;
                }
                var next = node.getNext();
                if (next) {
                  return next;
                }
                if (isElement(node) && node.getChild(0)) {
                  html += closeNode(node);
                }
                node = node.getParent();
              }
            }

            function isElement(node) {
              return node.type === CKEDITOR.NODE_ELEMENT;
            }

            function isContainer(node) {
              // Hopefully this is consistent across all ckeditor platforms
              return $(node.$).hasClass('cke_editable');
            }

            return html;
          }

          function openNode(node) {
            var html = '<' + node.getName();
            // There is no getAttributes (plural), so
            // let's work around that by going native
            for (var attr, i = 0, attrs = node.$.attributes, l = attrs.length; i < l; i++) {
              html += ' ';
              attr = attrs.item(i);
              html += attr.nodeName + '="' + apos.escapeHtml(attr.value) + '"';
            }
            if (!node.$.firstChild) {
              html += ' />';
            } else {
              html += '>';
            }
            return html;
          }
          function closeNode(node) {
            return '</' + node.getName() + '>';
          }
        }
      }));
      // The button that triggers the command
      editor.ui.addButton('split', {
        label: 'Split in two', //this is the tooltip text for the button
        command: 'split',
        icon: this.path + 'icons/split.png'
      });
    }
});
