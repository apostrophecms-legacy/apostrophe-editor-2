# apostrophe-editor-2

`apostrophe-editor-2` replaces Apostrophe's default content editor with a friendlier and more reliable system that puts the design intentions of the developer first. We now consider `apostrophe-editor-2` to be the preferred editor and are deprecating the original A2 editor. The new editor is included in the sandbox.

To switch it on for an existing project, just include this module and the `apostrophe-ui-2` module in your `apostrophe-site` configuration in `app.js`:

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
        icon: 'icon-arrow-left',
        tooltip: 'Float Left',
        // Only allows one type of widget
        widgets: [ 'slideshow' ],
        // Override the options for slideshows when they are inside the lockup to get the size right
        slideshow: {
          size: 'one-third'
        }
      },
      right: {
        label: 'Right',
        icon: 'icon-arrow-right',
        tooltip: 'Float Right',
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

**"But how do I get it to float?"** Apostrophe guarantees that the widget and the text it's been locked to will be wrapped in a div with the `apostrophe-lockup` class, and also a CSS class with the same name as the lockup. So if your lockup is named `left`, you can count on the classes `apostrophe-lockup` and `left` existing on that div. From there you should have no trouble targeting the widget, for instance:


```css
.apostrophe-lockup.left .apos-widget {
  float: left;
  width: 300px;
}
```

Actually floating and sizing things is up to you and your CSS, but lockups help you by always nesting the widget to be floated as a direct child of a div with the `apostrophe-lockup` class.

## Adding tags with custom attributes to the Styles menu
You can pass custom attributes (like classes) to tags in the Styles menu of CKEditor by adding the element to the styles array of an area:

    {{
        aposArea(page, 'content', {
          styles: [ 
            { value: 'h5', label: 'Heading 5' },
            { value: 'div', label: 'Centered', attributes: {class: 'centered' } }
          ] 
      })
    }}

After which you must make the proper exception in apostrophe-site's SanitizeHtml in app.js (add it if you don't have it)

    var site = require('apostrophe-site')({
      sanitizeHtml: {
        allowedAttributes: {
            a: [ 'href', 'name', 'target' ],
            img: [ 'src' ],
            div: [ 'class' ]
        },
      },
    })

## Text-Only "Areas"

`apostrophe-editor-2` allows for text-only areas. Just specify `textOnly: true` among the options you pass to `aposArea`. When you do so, there will always be just one text block, and there will be no controls to drag, reorder or delete it.

(TODO: make it possible to call `aposSingleton` with a type of `richText`. For now, use the `textOnly` option.)

## Areas with No Text

You can also have an area that does not allow rich text items at all. To request this, specify `richText: false` among the options you pass to `aposArea`. Only widgets, such as slideshows, will be offered on the "Add Content" menu.

## Splitting a Text

Sometimes your users may want to add a slideshow or video in the middle of a text. To make this easier, we've added an optional `split` control. If you include this control in the `controls` array, users are able to split a text item in half at the current cursor position. This opens up the possibilty of moving a widget into place between the two text items.

## CKEditor Plugins

You can load extra CKEditor plugins into CKEditor in `app.js`, when you configure the `apostrophe-editor-2` module:

    'apostrophe-editor-2': {
      plugins: [
        { name: 'headline', path: '/editor/plugins/headline/' }
      ]
    }

Or, if you only want them for certain areas, with `aposArea()` via the `plugins` option:

    {{
        aposArea(page, 'content', {
          plugins: [
            { name: 'headline', path: '/editor/plugins/headline/' }
          ]
        })
    }}

This will instruct CKEditor to load the file `/public/editor/plugins/headline/plugin.js`.

## Extra ckeditor configuration

You can add custom properties to the `config` object passed when instantiating ckeditor by setting the `config` option of the module. This option is merged with the `config` object that `apostrophe-editor-2` builds. For example, let's configure the `justify` plugin to use classes rather than style attributes:

    'apostrophe-editor-2': {
      config: {
        justifyClasses: [ 'apos-align-left', 'apos-align-center', 'apos-align-right', 'apos-align-justify' ]
      }
    },
