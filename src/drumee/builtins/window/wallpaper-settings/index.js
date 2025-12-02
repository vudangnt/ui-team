const { filesize, timestamp, dataTransfer } = require("core/utils")

const __window_interact = require('../interact');

/**
 * @class __window_wallpaper_settings
 * @extends __window_interact
*/
class __window_wallpaper_settings extends __window_interact {

  constructor(...args) {
    super(...args);
    this.onDomRefresh = this.onDomRefresh.bind(this);
    this.onUiEvent = this.onUiEvent.bind(this);
    this.getCurrentApi = this.getCurrentApi.bind(this);
    this.mediaDragOver = this.mediaDragOver.bind(this);
    this.mediaDragLeave = this.mediaDragLeave.bind(this);
    this.mediaDrop = this.mediaDrop.bind(this);
    this._selectedColor = null;
    this._selectedWallpaper = null;
  }

  /**
   *
   */
  static initClass() {
    this.prototype.isFolder = 1;
    this.prototype.acceptMedia = 1;
    this.prototype.figName = "window_wallpaper_settings";
    // Don't bind events at window level - handle only on uploader area
  }

  /**
   * @param {*} opt
   */
  initialize(opt) {
    require('./skin');
    super.initialize(opt);
    this.model.set({
      hub_id: Visitor.id,
      role: _a.search
    });
    this.acceptMedia = 1;
    this.isWallpaperSettings = 1;
  }

  /**
   * Override parent method
   * @returns 
   */
  seek_insertion() {
    this.raise()
    const uploader = this.findPart('uploader');
    if (uploader && uploader.el) {
      uploader.el.dataset.over = _a.on;
    }
    return null;
  }

  /**
   * Handle media drag over on uploader area
   */
  mediaDragOver(e, ui) {
    e.stopPropagation();
    e.preventDefault();
    const uploader = this.findPart('uploader');
    if (uploader && uploader.el) {
      uploader.el.dataset.over = _a.on;
    }
    if (e.originalEvent && e.originalEvent.dataTransfer) {
      e.originalEvent.dataTransfer.dropEffect = 'copy';
    }
    return false;
  }

  /**
   * Handle media drag leave from uploader area
   */
  mediaDragLeave(e, ui) {
    e.stopPropagation();
    e.preventDefault();
    const uploader = this.findPart('uploader');
    if (uploader && uploader.el) {
      uploader.el.dataset.over = _a.off;
    }
    return false;
  }

  /**
   * Handle media drop on uploader area
   */
  mediaDrop(e, ui) {
    this.debug("mediaDrop", e, ui);
    e.stopPropagation();
    e.preventDefault();
    
    const uploader = this.findPart('uploader');
    if (uploader && uploader.el) {
      uploader.el.dataset.over = _a.off;
    }

    const originalEvent = e.originalEvent || e;
    const transfer = dataTransfer(originalEvent);
    const files = transfer.files || [];
    this.debug("mediaDrop extracted", transfer, files);

    if (!files || files.length === 0) {
      this.debug("mediaDrop: no files", e);
      return false;
    }

    if (files.length > 1) {
      this.warning("Uploading files to wallpaper is limited to one single file at a time.");
      return false;
    }

    let file = files[0];
    if (!file) {
      this.debug("mediaDrop: invalid file", file);
      return false;
    }

    // Handle FileEntry - convert to File
    if (file.isFile && _.isFunction(file.file)) {
      file.file((fileObj) => {
        if (fileObj) {
          this.updateFileSizeText(fileObj);
          this.previewFileImage(fileObj);
          this.handleUpload(fileObj);
        } else {
          this.warning("Failed to read file from FileEntry");
        }
      });
      return false;
    }

    // Handle regular File object
    if (!(file instanceof File)) {
      this.debug("mediaDrop: file is not a File object", file);
      return false;
    }

    this.updateFileSizeText(file);
    this.previewFileImage(file);
    this.handleUpload(file);
    return false;
  }

  /**
   * Refresh gallery list
   */
  _refreshGallery() {
    this.debug("Refreshing gallery...");
    const listPart = this.findPart('roll-wallpaper');
    if (listPart && listPart.restart) {
      listPart.restart();
      this.debug("Gallery refresh triggered");
    } else {
      this.debug("Gallery list part not found or restart method not available");
    }
  }

  /**
   * Handle upload files
   */
  handleUpload(file) {
    this.debug("handleUpload wallpaper settings", file);
    if (!file || !(file instanceof File)) {
      this.warning("Invalid file for upload", file);
      return;
    }
    
    /** Create a folder where to store the wallpaper */
    this.postService(SERVICE.media.make_dir, {
      hub_id: Visitor.id,
      nid: Visitor.get(_a.home_id),
      ownpath: `${LOCALE.PHOTO}/${LOCALE.DESKTOP_WALLPAPER}`,
    }).then((data) => {
      this.debug("make_dir response", data);
      if (!data || !data.nid) {
        this.warning("Failed to create wallpaper folder", data);
        return;
      }
      
      let {
        nid,
        home_id,
        hub_id
      } = data;
      
      /** Append media uploader queue */
      this.append({
        kind: "media_uploader",
        mode: 'row',
        uiHandler: [this],
      });
      let queue = this.children.last();
      
      if (!queue) {
        this.warning("Failed to create uploader queue");
        return;
      }

      queue.once("quota:exceeded", () => {
        this.warning("Quota exceeded");
      });

      queue.once(_e.eod, (data) => {
        this.debug("Upload EOD event", data);
        // Refresh gallery after upload completes
        _.delay(() => {
          this._refreshGallery();
        }, 800);
      });

      queue.once("upload:response", (data) => {
        this.debug("Upload response - got authorization", data);
      });

      // Listen for destroy event - upload queue is destroyed when upload completes
      queue.once(_e.destroy, () => {
        this.debug("Upload queue destroyed - upload completed");
        _.delay(() => {
          this._refreshGallery();
        }, 1000);
      });

      let args = {
        destination: {
          nid,
          home_id,
          hub_id
        },
        file,
        echoId: this.mget('echoId'),
        listener: this,
        position: 0,
      }
      
      this.debug("Adding file to upload queue", args);
      queue.add(args);
    }).catch((error) => {
      this.warning("Failed to setup upload", error);
    });
  }

  /**
   * Insert media files
   */
  insertMedia(items, options = {}) {
    this.debug("insertMedia wallpaper settings", items, options);
    return;
  }

  /**
   * Update file size text display
   * @param {File} file 
   */
  updateFileSizeText(file) {
    if (!file || !file.size) return;
    
    this.ensurePart("file-size-text").then((p) => {
      if (p && p.set) {
        const formattedSize = filesize(file.size);
        p.set({ content: formattedSize });
      }
    }).catch((err) => {
      this.debug("Could not update file size text", err);
    });
  }

  /**
   * Preview selected file image in uploader
   * @param {File} file 
   */
  previewFileImage(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      // Clear preview if not an image
      this.clearPreviewImage();
      return;
    }
    
    this.ensurePart("uploader").then((uploaderPart) => {
      if (uploaderPart && uploaderPart.el) {
        const url = URL.createObjectURL(file);
        
        // Set background image with cover and positioning (similar to drag over)
        uploaderPart.el.style.backgroundImage = `url(${url})`;
        uploaderPart.el.style.backgroundSize = 'cover';
        uploaderPart.el.style.backgroundPosition = '50% 50%';
        uploaderPart.el.style.backgroundRepeat = 'no-repeat';
        
        // Clean up old object URL when new one is set
        if (this._previewObjectUrl) {
          URL.revokeObjectURL(this._previewObjectUrl);
        }
        this._previewObjectUrl = url;
        
        this.debug("Preview image set for uploader", file.name);
      }
    }).catch((err) => {
      this.debug("Could not preview file image", err);
    });
  }

  /**
   * Clear preview image from uploader
   */
  clearPreviewImage() {
    this.ensurePart("uploader").then((uploaderPart) => {
      if (uploaderPart && uploaderPart.el) {
        uploaderPart.el.style.backgroundImage = '';
        uploaderPart.el.style.backgroundSize = '';
        uploaderPart.el.style.backgroundPosition = '';
        uploaderPart.el.style.backgroundRepeat = '';
      }
    });
    
    // Clean up object URL
    if (this._previewObjectUrl) {
      URL.revokeObjectURL(this._previewObjectUrl);
      this._previewObjectUrl = null;
    }
  }

  /**
   * Handle new content after upload (from socket events)
   * @param {*} xhr 
   * @param {*} options 
   */
  newContent(xhr, options = {}) {
    this.debug("newContent wallpaper settings", xhr, options);
    const { data } = xhr || {};
    
    // Only refresh if this is related to wallpaper folder
    if (data) {
      const wp = Platform.get('wallpaper');
      if (wp) {
        const wallpaperPath = wp.nid || wp.path;
        if (wallpaperPath && data.pid === wallpaperPath) {
          // Refresh gallery after upload completes
          _.delay(() => {
            this._refreshGallery();
          }, 1200);
        }
      }
    }
    
    // Call parent method to handle the content
    return super.newContent(xhr, options);
  }

  /**
   * Handle websocket events
   * @param {*} args 
   */
  handleWsEvent(args = {}) {
    const { data, options } = args || {};
    const { service } = options || {};
    
    // Handle media upload events
    if (service === SERVICE.media.upload) {
      this.debug("handleWsEvent: media upload", args);
      const wp = Platform.get('wallpaper');
      if (wp && data) {
        const wallpaperPath = wp.nid || wp.path;
        if (wallpaperPath && data.pid === wallpaperPath) {
          // Refresh gallery when upload completes via socket
          _.delay(() => {
            this._refreshGallery();
          }, 1500);
        }
      }
    }
    
    // Call parent to handle other events
    return super.handleWsEvent(args);
  }

  /**
   *
   */
  onDomRefresh() {
    this.debug("__window_wallpaper_settings onDomRefresh", this);
    this.feed(require("./skeleton").default(this));
    this.raise();
    // Handle events only on uploader container
    this.ensurePart("uploader").then((p) => {
      if (p && p.$el) {
        p.$el.droppable({
          tolerance: "touch",
          over: this.mediaDragOver,
          out: this.mediaDragLeave,
          drop: this.mediaDrop,
          greedy: true
        });
      }
    });
  }


  /**
   * @param {*} child
   * @param {*} pn
   */
  onPartReady(child, pn) {
    this.raise();
    switch (pn) {
      case _a.content:
        this._content = child;
        this.setupInteract();
        this.waitElement(child.el, () => {
          child.feed(require('./skeleton/content').default(this));
        });
        break;
      default:
        return super.onPartReady(child, pn);
    }
  }

  /**
   * @param {*} cmd
   * @param {*} args
   */
  onUiEvent(cmd, args = {}) {
    // Follow the same pattern as wallpaper/index.js and account/preferences/index.js
    // Try multiple ways to get service to avoid undefined
    let service;
    
    // First check args.service (from button clicks)
    if (args.service) {
      service = args.service;
    }
    // Check cmd.service directly
    else if (cmd.service) {
      service = cmd.service;
    }
    // Check if cmd has status and model (from account/preferences pattern)
    else if (cmd.status === _e.submit && cmd.model && cmd.model.get) {
      service = cmd.model.get(_a.service) || cmd.status;
    }
    // Check cmd.source (from account/preferences pattern)
    else if (cmd.source != null && cmd.source.model && cmd.source.model.get) {
      service = cmd.source.model.get(_a.service);
    }
    // Check cmd.model directly (for wallpaper gallery items)
    else if (cmd.model && cmd.model.get) {
      service = cmd.model.get(_a.service);
    }
    // Fallback to mget methods (from wallpaper/index.js pattern)
    else if (cmd.mget) {
      service = cmd.mget(_a.service) || cmd.mget(_a.name);
    }
    
    // If service is still undefined, log warning and delegate to parent
    if (!service) {
      this.debug("onUiEvent: service is undefined, delegating to parent", cmd, args);
      return super.onUiEvent(cmd, args);
    }
    
    this.debug(`onUiEvent service=${service}`, cmd, this);

    switch (service) {
      case _e.close:
      case "close-popup":
        return this.goodbye();

      case "apply-new-bg":
        // Apply wallpaper or color that has been selected
        // This is called when user clicks the "Apply & Save" button
        // Follow the same pattern as account/preferences for applying wallpaper
        return this._applyWallpaper(cmd);

      case "upload-image":
        // Handle button click to open file selector dialog
        this.ensurePart('fselector').then((fileSelectorPart) => {
          if (fileSelectorPart && fileSelectorPart.open) {
            return fileSelectorPart.open((e) => {
              // Handle file selection from dialog
              const files = e.target.files || [];
              if (files && files.length > 0) {
                const file = files[0];
                // Update file size text and preview
                this.updateFileSizeText(file);
                this.previewFileImage(file);
                this.handleUpload(file);
              }
            });
          } else {
            this.warning("File selector part not found or open method not available");
          }
        }).catch((err) => {
          this.error("Failed to open file selector", err);
        });
        break;

      case "select-color":
        // Handle color selection
        const selectedColor = cmd.el.dataset.color;
        if (selectedColor) {
          this._selectedColor = selectedColor;
          this._selectedWallpaper = null; // Clear wallpaper when color is selected
          
          // Update visual feedback - remove selection from all swatches
          const swatches = this.el.querySelectorAll(`.${this.fig.family}__color-swatch`);
          swatches.forEach((swatch) => {
            swatch.dataset.selected = "0";
          });
          
          // Mark selected swatch
          cmd.el.dataset.selected = "1";
          
          this.debug("Color selected", selectedColor);
        }
        break;

      case "set-wallpaper":
        // Store wallpaper selection (but don't apply yet - wait for Apply button)
        // Follow the same pattern as account/preferences for getting wallpaper data
        if (!cmd.model) {
          this.warning("set-wallpaper: cmd.model is not available", cmd);
          break;
        }
        
        this._selectedWallpaper = {
          nid: cmd.model.get(_a.nodeId),
          hub_id: cmd.model.get(_a.hub_id) || cmd.model.get(_a.ownerId),
          vhost: cmd.model.get(_a.vhost)
        };
        this._selectedColor = null; // Clear color when wallpaper is selected
        
        // Update visual feedback - remove selection from all color swatches
        const swatches = this.el.querySelectorAll(`.${this.fig.family}__color-swatch`);
        if (swatches) {
          swatches.forEach((swatch) => {
            swatch.dataset.selected = "0";
          });
        }
        
        this.debug("Wallpaper selected", this._selectedWallpaper);
        break;

      default:
        return super.onUiEvent(cmd, args);
    }
  }

  /**
   * Apply wallpaper or color changes
   * Follow the same pattern as account/preferences for setting wallpaper
   * When Apply/Save button is clicked, this method applies the selected wallpaper or color
   */
  _applyWallpaper(cmd) {
    this.debug("_applyWallpaper", cmd, this._selectedColor, this._selectedWallpaper);
    
    let opt = {
      wallpaper: {}
    };

    // If color is selected, set color
    if (this._selectedColor) {
      opt.wallpaper = {
        nid: "",
        hub_id: "",
        vhost: "",
        color: this._selectedColor
      };
    } 

    // If wallpaper is selected (from gallery click), use it
    // Follow the same pattern as account/preferences: create opt with nid, hub_id, vhost
    // Use the wallpaper data that was stored when user clicked on a wallpaper item
    else if (this._selectedWallpaper && this._selectedWallpaper.nid && this._selectedWallpaper.hub_id) {
      opt.wallpaper = {
        nid: this._selectedWallpaper.nid,
        hub_id: this._selectedWallpaper.hub_id,
        vhost: this._selectedWallpaper.vhost
      };
    } else {
      // No selection made
      this.warning("_applyWallpaper: No wallpaper or color selected. _selectedWallpaper:", this._selectedWallpaper, "_selectedColor:", this._selectedColor);
      return;
    }

    // Apply settings - follow the same pattern as account/preferences
    // Use SERVICE.drumate.update_settings with settings: opt and hub_id: Visitor.id
    return this.postService({
      service: SERVICE.drumate.update_settings,
      settings: opt,
      hub_id: Visitor.id
    }, { async: 1 }).then((data) => {
      // Update Visitor settings - same as preferences: Visitor.set({ settings: JSON.parse(data.settings) })
      Visitor.set({ settings: JSON.parse(data.settings) });
      
      // Update wallpaper/color based on what was selected
      if (this._selectedColor) {
        // Apply color: clear wallpaper and set color
        // Update desk module state to reflect color selection
        if (window.Desk) {
          window.Desk._wallpaper = 0;
          window.Desk._color = this._selectedColor;
        }
      } else if (this._selectedWallpaper && this._selectedWallpaper.nid) {
        // Apply wallpaper - same as preferences: use uiRouter.setWallpaper with Visitor.wallpaper()
        uiRouter.setWallpaper(Visitor.wallpaper());
        
        // Update desk module state to reflect wallpaper selection
        if (window.Desk) {
          window.Desk._wallpaper = 1;
          window.Desk._color = null;
        }
      }
      
      // Update desk DOM immediately if it's already rendered
      if (window.Desk && window.Desk.el) {
        window.Desk.el.dataset.wallpaper = window.Desk._wallpaper || "0";
        
        if (window.Desk._color) {
          window.Desk.el.dataset.color = window.Desk._color;
          window.Desk.el.style.backgroundColor = window.Desk._color;
        } else {
          // Remove color attribute and background when wallpaper is set
          if (window.Desk.el.dataset.color) {
            delete window.Desk.el.dataset.color;
          }
          window.Desk.el.style.backgroundColor = '';
        }
        
        // Update main element too
        const mainEl = window.Desk.el.querySelector('.desk-module__main');
        if (mainEl) {
          mainEl.dataset.wallpaper = window.Desk._wallpaper || "0";
          if (window.Desk._color) {
            mainEl.dataset.color = window.Desk._color;
            mainEl.style.backgroundColor = window.Desk._color;
          } else {
            if (mainEl.dataset.color) {
              delete mainEl.dataset.color;
            }
            mainEl.style.backgroundColor = '';
          }
        }
      }
      
      // Restart desk to ensure all changes are applied
      if (window.Desk && window.Desk.restart) {
        window.Desk.restart();
      }
      
      // Close window after applying
      return this.goodbye();
    }).catch((error) => {
      this.error("Failed to apply wallpaper/color settings", error);
    });
  }

  /**
   * @param {*} type
   */
  getCurrentApi(type) {
    const wp = Platform.get('wallpaper');
    
    if (!wp) {
      this.warning("Wallpaper platform config not found");
      return null;
    }

    // Use nid if available, otherwise fallback to path
    const nid = wp.nid || wp.path;
    
    if (!nid) {
      this.warning("Wallpaper path/nid not found in platform config", wp);
      return null;
    }

    let api = {
      service: SERVICE.media.get_by_type,
      page: 1,
      type: _a.image,
      nid: nid,
      sort: _a.rank,
      order: 'desc',
      vhost: wp.vhost,
      timer: 2000
    };
    
    this.debug("getCurrentApi wallpaper settings", api);
    return api;
  }

}

__window_wallpaper_settings.initClass();
module.exports = __window_wallpaper_settings;

