# apostrophe-editor-2

`apostrophe-editor-2` replaces Apostrophe's content editor with a friendlier and more reliable system that puts the design intentions of the developer first.

To switch it on, just include this module and the `apostrophe-ui-2` module in your `apostrophe-site` configuration in `app.js`:

    // Must be first
    'apostrophe-ui-2': { },
    ... other modules ...
    'apostrophe-editor-2': { },
    ... other modules ...

`apostrophe-editor-2` is built on ckeditor, a widely recognized open source rich text editing solution with a history of thorough debugging across browsers and platforms.

`apostrophe-editor-2` also allows users to add Apostrophe's widgets to an area.

You can use `apostrophe-editor-2` as a drop-in replacement for the built-in editor. You can also specify CKEditor-specific menu items in your `controls` option.

## Float Content Sanely With Lockups

`apostrophe-editor-2` supports lockups. A lockup is a marriage between one rich text item and one widget, such as a slideshow.

Users begin by adding text blocks and widgets to the area. Then, they may drag any widget via its handle and drop it on a text block. This locks the two together.

However, we believe strongly in preserving your design intentions. So if you do not configure any lockups for a particular `aposArea` call, then the user is not permitted to drop widgets on text.

Lockups must be configured at the project level, typically in `app.js`, but you decide which lockups to enable by name when inserting each area.

Here's how you define lockups:

    ... more apostrophe-site configuration ...
    lockups: {
      left: {
        label: 'Left',
        icon: 'left',
        // Only allows one type of widget
        widgets: [ 'slideshow' ],
        // Override the options for slideshows when they are inside the lockup to get the size right
        slideshow: {
          size: 'one-third'
        }
      },
      right: {
        label: 'Right',
        icon: 'right',
        // Allows two types of widget
        widgets: [ 'slideshow', 'video' ],
        slideshow: {
          size: 'one-half'
        },
        video: {
          size: 'one-half'
        }
      }
    },

And here's how you permit them in a particular area:

    {{
        aposArea(page, 'content2', {
          controls: ['style', 'bold', 'italic', 'slideshow' ],
          lockups: [ 'left', 'right' ] })
    }}

Again, *if you do not enable lockups explicitly for each area, they are not permitted.*

Configuring lockups for areas in the schema of a snippet subclass works as you'd expect: just set the lockups option as you would when calling `aposArea`.

## Text-Only "Areas"

`apostrophe-editor-2` allows for text-only areas. Just specify `textOnly: true` among the options you pass to `aposArea`. When you do so, there will always be just one text block, and there will be no controls to drag, reorder or delete it.

(TODO: make it possible to call `aposSingleton` with a type of `richText`. For now, use the `textOnly` option.)

