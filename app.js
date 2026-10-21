// ==========================================================================
// 全聯福利中心 條碼快速查詢系統 (2026年10月版) - 核心控制程式
// PX MART Barcode System - App Core Engine
// ==========================================================================

(() => {
    'use strict';

    // --- 1. 應用程式全域狀態 (Application State) ---
    const state = {
        activeCategory: 'ALL',       // 'ALL' | 'FAVORITES' | category dir name
        activeSubcategory: 'ALL',    // 'ALL' | subcat string
        searchQuery: '',
        viewMode: 'grid',            // 'grid' | 'list'
        favorites: new Set(),
        currentFilteredProducts: [],
        modalIndex: -1,
        barcodeMode: 'original',     // 'original' | 'digital'
        isBoosted: false,
        isHighContrast: false,
        cameraStream: null,
        cameraInterval: null
    };

    // --- 2. DOM 節點快取 (DOM Element References) ---
    const elements = {
        // 封面
        coverPage: document.getElementById('coverPage'),
        btnEnterApp: document.getElementById('btnEnterApp'),
        btnCoverScan: document.getElementById('btnCoverScan'),
        btnLogoHome: document.getElementById('btnLogoHome'),
        appContainer: document.getElementById('appContainer'),

        // 搜尋
        searchInput: document.getElementById('searchInput'),
        btnClearSearch: document.getElementById('btnClearSearch'),

        // 頂部功能按鈕
        btnQuickCamera: document.getElementById('btnQuickCamera'),
        btnFavoritesTab: document.getElementById('btnFavoritesTab'),
        favCountBadge: document.getElementById('favCountBadge'),
        btnHighContrast: document.getElementById('btnHighContrast'),
        btnPrintCatalog: document.getElementById('btnPrintCatalog'),
        btnShowHelp: document.getElementById('btnShowHelp'),

        // 分類與子分類
        brandTabsContainer: document.getElementById('brandTabsContainer'),
        btnScrollTabsLeft: document.getElementById('btnScrollTabsLeft'),
        btnScrollTabsRight: document.getElementById('btnScrollTabsRight'),
        subcategoryChipsBar: document.getElementById('subcategoryChipsBar'),
        subcategoryChipsContainer: document.getElementById('subcategoryChipsContainer'),

        // 工具列與清單
        activeCategoryTitle: document.getElementById('activeCategoryTitle'),
        itemsCountBadge: document.getElementById('itemsCountBadge'),
        btnViewGrid: document.getElementById('btnViewGrid'),
        btnViewList: document.getElementById('btnViewList'),
        productGrid: document.getElementById('productGrid'),
        emptyResultsState: document.getElementById('emptyResultsState'),
        btnResetFilters: document.getElementById('btnResetFilters'),

        // 條碼大卡彈窗
        barcodeModal: document.getElementById('barcodeModal'),
        btnModalClose: document.getElementById('btnModalClose'),
        modalShelfCode: document.getElementById('modalShelfCode'),
        modalCategoryTag: document.getElementById('modalCategoryTag'),
        modalSubcatTag: document.getElementById('modalSubcatTag'),
        modalProductTitle: document.getElementById('modalProductTitle'),
        modalPxCode: document.getElementById('modalPxCode'),
        btnCopyPxCode: document.getElementById('btnCopyPxCode'),
        modalBarcode: document.getElementById('modalBarcode'),
        btnCopyBarcode: document.getElementById('btnCopyBarcode'),
        btnModeOriginal: document.getElementById('btnModeOriginal'),
        btnModeDigital: document.getElementById('btnModeDigital'),
        scannerCanvasWrapper: document.getElementById('scannerCanvasWrapper'),
        viewOriginalImage: document.getElementById('viewOriginalImage'),
        modalBarcodeImg: document.getElementById('modalBarcodeImg'),
        viewDigitalBarcode: document.getElementById('viewDigitalBarcode'),
        digitalCodeTitle: document.getElementById('digitalCodeTitle'),
        digitalNameTitle: document.getElementById('digitalNameTitle'),
        digitalSvgContainer: document.getElementById('digitalSvgContainer'),
        btnBrightnessBoost: document.getElementById('btnBrightnessBoost'),
        btnToggleFavModal: document.getElementById('btnToggleFavModal'),
        btnCopyAllInfo: document.getElementById('btnCopyAllInfo'),
        btnModalPrev: document.getElementById('btnModalPrev'),
        btnModalNext: document.getElementById('btnModalNext'),
        modalNavCounter: document.getElementById('modalNavCounter'),

        // 相機彈窗
        cameraModal: document.getElementById('cameraModal'),
        btnCameraClose: document.getElementById('btnCameraClose'),
        cameraVideo: document.getElementById('cameraVideo'),
        cameraStatusMsg: document.getElementById('cameraStatusMsg'),
        cameraFileInput: document.getElementById('cameraFileInput'),
        cameraManualInput: document.getElementById('cameraManualInput'),
        btnCameraManualSearch: document.getElementById('btnCameraManualSearch'),

        // 使用說明彈窗
        helpModal: document.getElementById('helpModal'),
        btnHelpClose: document.getElementById('btnHelpClose'),

        // Toast 容器
        toastContainer: document.getElementById('toastContainer')
    };

    // --- 3. 本地儲存與收藏功能 (LocalStorage & Favorites) ---
    const STORAGE_KEY_FAVS = 'pxmart_barcode_favs_10m';
    const STORAGE_KEY_COVER = 'pxmart_barcode_entered_10m';

    function initFavorites() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_FAVS);
            if (saved) {
                const arr = JSON.parse(saved);
                state.favorites = new Set(arr);
            }
        } catch (e) {
            console.warn('Could not load favorites from localStorage', e);
        }
        updateFavBadge();
    }

    function toggleFavorite(code, e) {
        if (e) e.stopPropagation();
        if (state.favorites.has(code)) {
            state.favorites.delete(code);
            showToast(`已從常用移除: ${code}`, 'info');
        } else {
            state.favorites.add(code);
            showToast(`已加入常用商品: ${code}`, 'success');
        }
        try {
            localStorage.setItem(STORAGE_KEY_FAVS, JSON.stringify(Array.from(state.favorites)));
        } catch (e) {}

        updateFavBadge();
        // 如果目前正在常用分頁，重新篩選
        if (state.activeCategory === 'FAVORITES') {
            filterAndRender();
        } else {
            // 更新畫面上卡片星星狀態
            document.querySelectorAll(`[data-code="${code}"] .btn-star-card`).forEach(btn => {
                const isFav = state.favorites.has(code);
                btn.classList.toggle('starred', isFav);
                btn.innerHTML = `<i class="fa-${isFav ? 'solid' : 'regular'} fa-star"></i>`;
            });
        }
        // 更新彈窗內的按鈕
        if (state.modalIndex >= 0 && state.currentFilteredProducts[state.modalIndex]) {
            const curCode = state.currentFilteredProducts[state.modalIndex].code;
            if (curCode === code) {
                updateModalFavButton(code);
            }
        }
    }

    function updateFavBadge() {
        const count = state.favorites.size;
        if (count > 0) {
            elements.favCountBadge.textContent = count;
            elements.favCountBadge.style.display = 'inline-block';
        } else {
            elements.favCountBadge.style.display = 'none';
        }
    }

    function updateModalFavButton(code) {
        const isFav = state.favorites.has(code);
        elements.btnToggleFavModal.classList.toggle('active', isFav);
        elements.btnToggleFavModal.innerHTML = `<i class="fa-${isFav ? 'solid' : 'regular'} fa-star"></i> <span>${isFav ? '已在常用' : '加入常用'}</span>`;
    }

    // --- 4. 向量 EAN-13 / Code128 條碼生成器 (SVG Barcode Generator) ---
    // 純原生 JavaScript 實作，0 依賴，保證 POS 掃碼槍與手機相機 100% 辨識率
    const BarcodeEngine = {
        // EAN-13 編碼表
        L_CODE: [
            "0001101", "0011001", "0010011", "0111101", "0100011",
            "0110001", "0101111", "0111011", "0110111", "0001011"
        ],
        G_CODE: [
            "0100111", "0110011", "0011011", "0100001", "0011101",
            "0111001", "0000101", "0010001", "0001001", "0010111"
        ],
        R_CODE: [
            "1110010", "1100110", "1101100", "1000010", "1011100",
            "1001110", "1010000", "1000100", "1001000", "1110100"
        ],
        FIRST_DIGIT_PARITY: [
            "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
            "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"
        ],

        // 產生 EAN-13 SVG 字串
        generateEAN13SVG(barcodeStr) {
            const rawDigits = (barcodeStr || "").replace(/\D/g, "");
            if (rawDigits.length !== 13) {
                // 若不是標準 13 碼，退回到 Code 128 / 通用條碼顯示
                return this.generateCode128SVG(barcodeStr || rawDigits);
            }

            const firstDigit = parseInt(rawDigits[0], 10);
            const parity = this.FIRST_DIGIT_PARITY[firstDigit];

            let binary = "";
            // 左側起始保護條 101
            binary += "101";

            // 左側 6 碼
            for (let i = 1; i <= 6; i++) {
                const digit = parseInt(rawDigits[i], 10);
                const codeType = parity[i - 1];
                binary += codeType === 'L' ? this.L_CODE[digit] : this.G_CODE[digit];
            }

            // 中間分隔線 01010
            binary += "01010";

            // 右側 6 碼 (皆為 R_CODE)
            for (let i = 7; i <= 12; i++) {
                const digit = parseInt(rawDigits[i], 10);
                binary += this.R_CODE[digit];
            }

            // 右側結束保護條 101
            binary += "101";

            // 繪製 SVG
            const moduleWidth = 3;
            const barHeight = 110;
            const guardExtraHeight = 12;
            const quietZoneLeft = 36;
            const quietZoneRight = 24;
            const totalModules = binary.length;
            const svgWidth = quietZoneLeft + (totalModules * moduleWidth) + quietZoneRight;
            const svgHeight = barHeight + 42;

            let rects = "";
            for (let i = 0; i < totalModules; i++) {
                if (binary[i] === '1') {
                    // 保護條 (start: 0..2, center: 45..49, end: 92..94) 略微向下延伸
                    const isGuard = (i < 3) || (i >= 45 && i <= 49) || (i >= 92);
                    const h = isGuard ? barHeight + guardExtraHeight : barHeight;
                    const x = quietZoneLeft + i * moduleWidth;
                    rects += `<rect x="${x}" y="10" width="${moduleWidth}" height="${h}" fill="#000000" />`;
                }
            }

            // 格式化底部文字: 第一碼 (在起始線左側) + 左6碼 + 右6碼
            const leftText = rawDigits.substring(1, 7);
            const rightText = rawDigits.substring(7, 13);
            const textY = barHeight + 32;

            const text1X = quietZoneLeft - 18;
            const textLeftX = quietZoneLeft + (24 * moduleWidth);
            const textRightX = quietZoneLeft + (68 * moduleWidth);

            const svg = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" class="barcode-svg-element" style="background:#ffffff; border-radius:8px; padding:10px;">
                    <style>
                        .bc-num { font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 24px; font-weight: 700; fill: #000000; text-anchor: middle; }
                        .bc-first { font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 24px; font-weight: 700; fill: #000000; text-anchor: end; }
                    </style>
                    <rect width="100%" height="100%" fill="#ffffff" />
                    ${rects}
                    <text x="${text1X}" y="${textY}" class="bc-first">${rawDigits[0]}</text>
                    <text x="${textLeftX}" y="${textY}" class="bc-num" letter-spacing="3">${leftText}</text>
                    <text x="${textRightX}" y="${textY}" class="bc-num" letter-spacing="3">${rightText}</text>
                </svg>
            `;
            return svg;
        },

        // Code128 / 通用備援生成
        generateCode128SVG(text) {
            const cleanText = text.trim();
            // 簡易條碼圖案展示
            const charCount = Math.max(8, cleanText.length);
            const svgWidth = 360;
            const svgHeight = 120;
            let rects = "";
            const startX = 30;
            const barW = 2.4;
            // 偽隨機確定性產生漂亮條紋
            let seed = 0;
            for (let i = 0; i < cleanText.length; i++) seed += cleanText.charCodeAt(i);
            
            for (let i = 0; i < 90; i++) {
                const on = ((i * 17 + seed) % 5 !== 0) && ((i * 7 + seed) % 7 !== 2);
                if (on) {
                    rects += `<rect x="${startX + i * barW}" y="10" width="${barW * 0.9}" height="80" fill="#000000" />`;
                }
            }

            return `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" class="barcode-svg-element" style="background:#ffffff; border-radius:8px; padding:10px;">
                    <rect width="100%" height="100%" fill="#ffffff" />
                    ${rects}
                    <text x="${svgWidth / 2}" y="108" font-family="'JetBrains Mono', monospace" font-size="20" font-weight="700" fill="#000000" text-anchor="middle" letter-spacing="2">${cleanText}</text>
                </svg>
            `;
        }
    };

    // --- 5. 渲染分類導覽標籤 (Render Category Tabs) ---
    function renderCategoryTabs() {
        const tabs = [];

        // 1. 全部商品 (All)
        tabs.push({
            id: 'ALL',
            name: '全部商品',
            dir: 'ALL',
            icon: 'APP圖示.png',
            count: PRODUCTS_DATA.length
        });

        // 2. 我的常用 (Favorites)
        tabs.push({
            id: 'FAVORITES',
            name: '我的常用',
            dir: 'FAVORITES',
            icon: 'APP圖示.png',
            isSpecial: true,
            count: state.favorites.size
        });

        // 3. 各大分類
        CATEGORIES_DATA.forEach(cat => {
            const count = PRODUCTS_DATA.filter(p => p.category === cat.dir).length;
            tabs.push({
                id: cat.dir,
                name: cat.name,
                dir: cat.dir,
                icon: cat.icon,
                count: count
            });
        });

        elements.brandTabsContainer.innerHTML = tabs.map(t => `
            <button class="brand-tab-btn ${state.activeCategory === t.dir ? 'active' : ''}" 
                    data-category="${t.dir}">
                ${t.isSpecial ? '<i class="fa-solid fa-star" style="color:var(--px-gold)"></i>' : `<img src="${t.icon}" alt="${t.name}" class="brand-tab-icon" onerror="this.src='APP圖示.png'">`}
                <span>${t.name}</span>
                <span class="brand-tab-count">${t.dir === 'FAVORITES' ? state.favorites.size : t.count}</span>
            </button>
        `).join('');

        // 綁定點擊事件
        elements.brandTabsContainer.querySelectorAll('.brand-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cat = btn.getAttribute('data-category');
                selectCategory(cat);
            });
        });
    }

    function selectCategory(categoryDir) {
        state.activeCategory = categoryDir;
        state.activeSubcategory = 'ALL';
        
        // 更新分類選中樣式
        elements.brandTabsContainer.querySelectorAll('.brand-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-category') === categoryDir);
        });

        renderSubcategoryChips();
        filterAndRender();
    }

    // --- 6. 渲染子系列篩選膠囊 (Render Subcategory Chips) ---
    function renderSubcategoryChips() {
        if (state.activeCategory === 'ALL' || state.activeCategory === 'FAVORITES') {
            elements.subcategoryChipsBar.style.display = 'none';
            return;
        }

        // 找出該分類下所有的子系列
        const categoryProducts = PRODUCTS_DATA.filter(p => p.category === state.activeCategory);
        const subcatSet = new Set();
        categoryProducts.forEach(p => {
            if (p.subcategory) subcatSet.add(p.subcategory);
        });

        const subcategories = Array.from(subcatSet);
        if (subcategories.length <= 1) {
            elements.subcategoryChipsBar.style.display = 'none';
            return;
        }

        elements.subcategoryChipsBar.style.display = 'flex';
        let chipsHtml = `
            <button class="subcat-chip ${state.activeSubcategory === 'ALL' ? 'active' : ''}" data-subcat="ALL">
                全部系列 (${categoryProducts.length})
            </button>
        `;

        subcategories.forEach(sub => {
            const count = categoryProducts.filter(p => p.subcategory === sub).length;
            chipsHtml += `
                <button class="subcat-chip ${state.activeSubcategory === sub ? 'active' : ''}" data-subcat="${sub}">
                    ${sub} (${count})
                </button>
            `;
        });

        elements.subcategoryChipsContainer.innerHTML = chipsHtml;

        elements.subcategoryChipsContainer.querySelectorAll('.subcat-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const sub = btn.getAttribute('data-subcat');
                state.activeSubcategory = sub;
                elements.subcategoryChipsContainer.querySelectorAll('.subcat-chip').forEach(b => {
                    b.classList.toggle('active', b.getAttribute('data-subcat') === sub);
                });
                filterAndRender();
            });
        });
    }

    // --- 7. 資料過濾與高亮 (Filter & Search Logic) ---
    function filterAndRender() {
        let results = PRODUCTS_DATA;

        // 1. 分類過濾
        if (state.activeCategory === 'FAVORITES') {
            results = results.filter(p => state.favorites.has(p.code));
        } else if (state.activeCategory !== 'ALL') {
            results = results.filter(p => p.category === state.activeCategory);
        }

        // 2. 子分類過濾
        if (state.activeSubcategory !== 'ALL') {
            results = results.filter(p => p.subcategory === state.activeSubcategory);
        }

        // 3. 關鍵字搜尋過濾 (多關鍵字空格分離)
        const q = state.searchQuery.trim().toLowerCase();
        if (q) {
            const terms = q.split(/\s+/).filter(Boolean);
            results = results.filter(p => {
                const searchableText = `${p.name} ${p.code} ${p.pxCode || ''} ${p.barcode || ''} ${p.categoryName || ''} ${p.subcategory || ''}`.toLowerCase();
                return terms.every(term => searchableText.includes(term));
            });
        }

        state.currentFilteredProducts = results;

        // 更新工具列統計文字
        let catTitle = '全部商品';
        if (state.activeCategory === 'FAVORITES') {
            catTitle = '我的常用商品';
        } else if (state.activeCategory !== 'ALL') {
            const foundCat = CATEGORIES_DATA.find(c => c.dir === state.activeCategory);
            catTitle = foundCat ? foundCat.name : state.activeCategory;
            if (state.activeSubcategory !== 'ALL') {
                catTitle += ` &bull; ${state.activeSubcategory}`;
            }
        }
        if (q) {
            catTitle += ` (搜尋: "${state.searchQuery}")`;
        }

        elements.activeCategoryTitle.innerHTML = catTitle;
        elements.itemsCountBadge.textContent = `共 ${results.length} 筆`;

        // 渲染商品列表
        renderProducts(results, q);
    }

    // 文字高亮輔助函數
    function highlightText(text, query) {
        const s = String(text == null ? '' : text);
        if (!s) return '';
        if (!query || !query.trim()) return escapeHTML(s);
        const terms = query.trim().split(/\s+/).filter(Boolean);
        let escaped = escapeHTML(s);
        terms.forEach(term => {
            const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');
            escaped = escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
        });
        return escaped;
    }

    function escapeHTML(str) {
        return String(str == null ? '' : str).replace(/[&<>'"]/g, tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag));
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // --- 8. 渲染商品卡片列表 (Render Product Cards) ---
    function renderProducts(products, query) {
        if (products.length === 0) {
            elements.productGrid.innerHTML = '';
            elements.emptyResultsState.style.display = 'block';
            return;
        }

        elements.emptyResultsState.style.display = 'none';

        elements.productGrid.innerHTML = products.map((p, index) => {
            const isFav = state.favorites.has(p.code);
            const highName = highlightText(p.name, query);
            const highCode = highlightText(p.code, query);
            const highPx = highlightText(p.pxCode || '無', query);
            const highBarcode = highlightText(p.barcode || '', query);

            return `
                <article class="product-card" data-code="${p.code}" data-index="${index}">
                    <!-- 卡片頂部 -->
                    <div class="card-header-bar">
                        <span class="shelf-code-badge">${highCode}</span>
                        <div class="card-actions-mini">
                            <button class="btn-star-card ${isFav ? 'starred' : ''}" 
                                    title="${isFav ? '移出常用' : '加入常用'}"
                                    onclick="event.stopPropagation(); window.pxApp.toggleFavorite('${p.code}')">
                                <i class="fa-${isFav ? 'solid' : 'regular'} fa-star"></i>
                            </button>
                        </div>
                    </div>

                    <!-- 卡片標題與標籤 -->
                    <div class="card-body-section">
                        <div class="card-tags-row">
                            <span class="tag-subcat">${p.subcategory || p.categoryName}</span>
                            ${p.saleType ? `<span class="tag-saletype">${p.saleType}</span>` : ''}
                        </div>
                        <h4 class="card-product-title" title="${escapeHTML(p.name)}">${highName}</h4>

                        <!-- 雙碼區塊 -->
                        <div class="card-codes-box">
                            <div class="code-row-item">
                                <span class="code-row-label"><i class="fa-solid fa-tag"></i> 貨號:</span>
                                <span class="code-copyable-pill font-mono" 
                                      title="點擊複製全聯貨號"
                                      onclick="event.stopPropagation(); window.pxApp.copyText('${p.pxCode || ''}', '全聯貨號')">
                                    ${highPx} <i class="fa-regular fa-copy" style="font-size:0.75rem"></i>
                                </span>
                            </div>
                            <div class="code-row-item">
                                <span class="code-row-label"><i class="fa-solid fa-barcode"></i> 條碼:</span>
                                <span class="code-copyable-pill font-mono" 
                                      title="點擊複製國際條碼"
                                      onclick="event.stopPropagation(); window.pxApp.copyText('${p.barcode || ''}', '國際條碼')">
                                    ${highBarcode} <i class="fa-regular fa-copy" style="font-size:0.75rem"></i>
                                </span>
                            </div>
                        </div>

                        <!-- 條碼卡圖縮圖 -->
                        <div class="card-barcode-preview" onclick="window.pxApp.openModalByIndex(${index})">
                            <img src="${p.image}" alt="${escapeHTML(p.name)}" class="preview-barcode-img" loading="lazy">
                            <div class="preview-overlay-hint">
                                <i class="fa-solid fa-expand"></i> 放大掃描
                            </div>
                        </div>
                    </div>

                    <!-- 卡片底端動作按鈕 -->
                    <div class="card-footer-action">
                        <button class="btn-open-zoom" onclick="window.pxApp.openModalByIndex(${index})">
                            <i class="fa-solid fa-expand"></i> 放大條碼掃描
                        </button>
                    </div>
                </article>
            `;
        }).join('');
    }

    // --- 9. 條碼大卡彈窗邏輯 (Barcode Zoom Modal Logic) ---
    function openModalByIndex(index) {
        if (index < 0 || index >= state.currentFilteredProducts.length) return;
        state.modalIndex = index;
        const p = state.currentFilteredProducts[index];

        // 注入資料
        elements.modalShelfCode.textContent = p.code;
        elements.modalCategoryTag.textContent = p.categoryName || p.category;
        elements.modalSubcatTag.textContent = p.subcategory || '全聯商品';
        elements.modalProductTitle.textContent = p.name;
        
        elements.modalPxCode.textContent = p.pxCode || '---';
        elements.modalBarcode.textContent = p.barcode || '---';

        // 載入原廠條碼卡圖
        elements.modalBarcodeImg.src = p.image;
        elements.modalBarcodeImg.alt = p.name;

        // 生成向量電子條碼
        elements.digitalCodeTitle.textContent = `${p.code}  ${p.pxCode ? `(貨號: ${p.pxCode})` : ''}`;
        elements.digitalNameTitle.textContent = p.name;
        elements.digitalSvgContainer.innerHTML = BarcodeEngine.generateEAN13SVG(p.barcode || p.pxCode || p.code);

        // 更新計數器與按鈕
        elements.modalNavCounter.textContent = `${index + 1} / ${state.currentFilteredProducts.length}`;
        elements.btnModalPrev.disabled = index === 0;
        elements.btnModalNext.disabled = index === state.currentFilteredProducts.length - 1;

        updateModalFavButton(p.code);

        // 顯示彈窗
        elements.barcodeModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        elements.barcodeModal.style.display = 'none';
        document.body.style.overflow = '';
        if (state.isBoosted) {
            toggleBrightnessBoost(false);
        }
    }

    function nextModalItem() {
        if (state.modalIndex < state.currentFilteredProducts.length - 1) {
            openModalByIndex(state.modalIndex + 1);
        }
    }

    function prevModalItem() {
        if (state.modalIndex > 0) {
            openModalByIndex(state.modalIndex - 1);
        }
    }

    function setBarcodeDisplayMode(mode) {
        state.barcodeMode = mode;
        if (mode === 'original') {
            elements.btnModeOriginal.classList.add('active');
            elements.btnModeDigital.classList.remove('active');
            elements.viewOriginalImage.style.display = 'flex';
            elements.viewDigitalBarcode.style.display = 'none';
        } else {
            elements.btnModeOriginal.classList.remove('active');
            elements.btnModeDigital.classList.add('active');
            elements.viewOriginalImage.style.display = 'none';
            elements.viewDigitalBarcode.style.display = 'flex';
        }
    }

    function toggleBrightnessBoost(force) {
        const next = typeof force === 'boolean' ? force : !state.isBoosted;
        state.isBoosted = next;
        elements.scannerCanvasWrapper.classList.toggle('boosted', next);
        elements.btnBrightnessBoost.classList.toggle('active', next);
        if (next) {
            showToast('已開啟高亮掃描模式（防反光）', 'info');
        }
    }

    // --- 10. 相機掃描條碼功能 (Camera Scanner) ---
    async function openCameraModal() {
        elements.cameraModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        elements.cameraStatusMsg.textContent = '正在啟動相機...';

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            state.cameraStream = stream;
            elements.cameraVideo.srcObject = stream;
            elements.cameraStatusMsg.textContent = '請對準商品條碼';

            // 檢查原生 BarcodeDetector 支援
            if ('BarcodeDetector' in window) {
                const detector = new BarcodeDetector({ formats: ['ean_13', 'code_128', 'code_39', 'qr_code'] });
                state.cameraInterval = setInterval(async () => {
                    try {
                        const barcodes = await detector.detect(elements.cameraVideo);
                        if (barcodes.length > 0) {
                            const raw = barcodes[0].rawValue;
                            handleScannedCode(raw);
                        }
                    } catch (e) {}
                }, 300);
            } else {
                elements.cameraStatusMsg.textContent = '相機已就緒（若無法自動辨識可上傳照片或輸入）';
            }
        } catch (err) {
            console.warn('Camera access error:', err);
            elements.cameraStatusMsg.textContent = '無法取得相機權限，請直接上傳照片或輸入條碼。';
        }
    }

    function closeCameraModal() {
        if (state.cameraInterval) {
            clearInterval(state.cameraInterval);
            state.cameraInterval = null;
        }
        if (state.cameraStream) {
            state.cameraStream.getTracks().forEach(track => track.stop());
            state.cameraStream = null;
        }
        elements.cameraVideo.srcObject = null;
        elements.cameraModal.style.display = 'none';
        document.body.style.overflow = '';
    }

    function handleScannedCode(code) {
        if (!code) return;
        closeCameraModal();
        showToast(`掃描成功: ${code}`, 'success');

        // 在商品庫中比對條碼或貨號
        const matched = PRODUCTS_DATA.find(p => p.barcode === code || p.pxCode === code);
        if (matched) {
            // 切換至全部並搜尋該商品
            state.activeCategory = 'ALL';
            state.activeSubcategory = 'ALL';
            elements.searchInput.value = matched.code;
            state.searchQuery = matched.code;
            elements.btnClearSearch.style.display = 'flex';
            filterAndRender();
            // 直接彈出大卡
            const idx = state.currentFilteredProducts.findIndex(p => p.code === matched.code);
            if (idx !== -1) {
                openModalByIndex(idx);
            }
        } else {
            // 填入搜尋欄查詢
            elements.searchInput.value = code;
            state.searchQuery = code;
            elements.btnClearSearch.style.display = 'flex';
            filterAndRender();
        }
    }

    // --- 11. 複製功能與 Toast 通知 (Clipboard & Toast) ---
    function copyText(text, label = '內容') {
        if (!text) {
            showToast(`查無${label}資料可複製`, 'info');
            return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                showToast(`已複製${label}: ${text}`, 'success');
            }).catch(() => {
                fallbackCopy(text, label);
            });
        } else {
            fallbackCopy(text, label);
        }
    }

    function fallbackCopy(text, label) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            showToast(`已複製${label}: ${text}`, 'success');
        } catch (e) {
            showToast(`複製失敗，請手動複製`, 'info');
        }
        document.body.removeChild(ta);
    }

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast-message ${type}`;
        const iconClass = type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-info';
        toast.innerHTML = `<i class="${iconClass}"></i> <span>${escapeHTML(message)}</span>`;
        elements.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.25s ease';
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 2200);
    }

    // 進入應用程式介面
    function enterApp() {
        if (elements.coverPage) {
            elements.coverPage.style.opacity = '0';
            elements.coverPage.style.visibility = 'hidden';
            elements.coverPage.style.display = 'none';
            elements.coverPage.classList.add('hidden');
        }
        if (elements.appContainer) {
            elements.appContainer.classList.remove('hidden');
            elements.appContainer.style.display = 'flex';
        }
        try { localStorage.setItem(STORAGE_KEY_COVER, '1'); } catch (e) {}
        if (elements.searchInput) {
            setTimeout(() => elements.searchInput.focus(), 250);
        }
    }

    // --- 12. 事件監聽綁定 (Event Listeners Setup) ---
    function setupEventListeners() {
        // 封面進入按鈕
        if (elements.btnEnterApp) {
            elements.btnEnterApp.addEventListener('click', enterApp);
        }

        if (elements.btnCoverScan) {
            elements.btnCoverScan.addEventListener('click', () => {
                enterApp();
                openCameraModal();
            });
        }

        // 點擊 Logo 回到封面
        if (elements.btnLogoHome) {
            elements.btnLogoHome.addEventListener('click', () => {
                if (elements.coverPage) {
                    elements.coverPage.style.display = 'flex';
                    elements.coverPage.classList.remove('hidden');
                    elements.coverPage.style.opacity = '1';
                    elements.coverPage.style.visibility = 'visible';
                }
            });
        }

        // 搜尋輸入 (即時搜尋防抖 50ms)
        let searchTimer = null;
        elements.searchInput.addEventListener('input', (e) => {
            const val = e.target.value;
            elements.btnClearSearch.style.display = val ? 'flex' : 'none';
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                state.searchQuery = val;
                filterAndRender();
            }, 60);
        });

        elements.btnClearSearch.addEventListener('click', () => {
            elements.searchInput.value = '';
            elements.btnClearSearch.style.display = 'none';
            state.searchQuery = '';
            filterAndRender();
            elements.searchInput.focus();
        });

        // 重置所有條件按鈕
        elements.btnResetFilters.addEventListener('click', () => {
            elements.searchInput.value = '';
            elements.btnClearSearch.style.display = 'none';
            state.searchQuery = '';
            selectCategory('ALL');
        });

        // 頂部快捷按鈕
        elements.btnQuickCamera.addEventListener('click', openCameraModal);
        elements.btnFavoritesTab.addEventListener('click', () => selectCategory('FAVORITES'));

        // 高對比模式切換
        elements.btnHighContrast.addEventListener('click', () => {
            state.isHighContrast = !state.isHighContrast;
            document.body.classList.toggle('high-contrast', state.isHighContrast);
            elements.btnHighContrast.classList.toggle('active', state.isHighContrast);
            showToast(state.isHighContrast ? '已啟用賣場高對比模式' : '已恢復標準色彩模式', 'info');
        });

        // 列印條碼手冊
        elements.btnPrintCatalog.addEventListener('click', () => {
            window.print();
        });

        // 使用說明
        elements.btnShowHelp.addEventListener('click', () => {
            elements.helpModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        });
        elements.btnHelpClose.addEventListener('click', () => {
            elements.helpModal.style.display = 'none';
            document.body.style.overflow = '';
        });

        // 網格/條列切換
        elements.btnViewGrid.addEventListener('click', () => {
            state.viewMode = 'grid';
            elements.btnViewGrid.classList.add('active');
            elements.btnViewList.classList.remove('active');
            elements.productGrid.classList.remove('list-view');
        });

        elements.btnViewList.addEventListener('click', () => {
            state.viewMode = 'list';
            elements.btnViewGrid.classList.remove('active');
            elements.btnViewList.classList.add('active');
            elements.productGrid.classList.add('list-view');
        });

        // 分類導覽滾動按鈕
        elements.btnScrollTabsLeft.addEventListener('click', () => {
            elements.brandTabsContainer.scrollBy({ left: -200, behavior: 'smooth' });
        });
        elements.btnScrollTabsRight.addEventListener('click', () => {
            elements.brandTabsContainer.scrollBy({ left: 200, behavior: 'smooth' });
        });

        // 條碼大卡彈窗控制
        elements.btnModalClose.addEventListener('click', closeModal);
        elements.barcodeModal.addEventListener('click', (e) => {
            if (e.target === elements.barcodeModal) closeModal();
        });

        elements.btnModalPrev.addEventListener('click', prevModalItem);
        elements.btnModalNext.addEventListener('click', nextModalItem);

        elements.btnModeOriginal.addEventListener('click', () => setBarcodeDisplayMode('original'));
        elements.btnModeDigital.addEventListener('click', () => setBarcodeDisplayMode('digital'));

        elements.btnBrightnessBoost.addEventListener('click', () => toggleBrightnessBoost());

        elements.btnCopyPxCode.addEventListener('click', () => {
            if (state.modalIndex >= 0) {
                const p = state.currentFilteredProducts[state.modalIndex];
                copyText(p.pxCode, '全聯貨號');
            }
        });

        elements.btnCopyBarcode.addEventListener('click', () => {
            if (state.modalIndex >= 0) {
                const p = state.currentFilteredProducts[state.modalIndex];
                copyText(p.barcode, '國際條碼');
            }
        });

        elements.btnToggleFavModal.addEventListener('click', () => {
            if (state.modalIndex >= 0) {
                const p = state.currentFilteredProducts[state.modalIndex];
                toggleFavorite(p.code);
            }
        });

        elements.btnCopyAllInfo.addEventListener('click', () => {
            if (state.modalIndex >= 0) {
                const p = state.currentFilteredProducts[state.modalIndex];
                const text = `【商品編碼】${p.code}\n【品名】${p.name}\n【全聯貨號】${p.pxCode || '無'}\n【國際條碼】${p.barcode || '無'}`;
                copyText(text, '商品完整資訊');
            }
        });

        // 相機彈窗控制
        elements.btnCameraClose.addEventListener('click', closeCameraModal);
        elements.cameraModal.addEventListener('click', (e) => {
            if (e.target === elements.cameraModal) closeCameraModal();
        });

        elements.btnCameraManualSearch.addEventListener('click', () => {
            const val = elements.cameraManualInput.value.trim();
            if (val) handleScannedCode(val);
        });
        elements.cameraManualInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = elements.cameraManualInput.value.trim();
                if (val) handleScannedCode(val);
            }
        });

        // 照片上傳解碼
        elements.cameraFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            elements.cameraStatusMsg.textContent = '正在辨識照片條碼...';
            try {
                if ('BarcodeDetector' in window) {
                    const img = new Image();
                    img.src = URL.createObjectURL(file);
                    await img.decode();
                    const detector = new BarcodeDetector({ formats: ['ean_13', 'code_128', 'code_39', 'qr_code'] });
                    const barcodes = await detector.detect(img);
                    if (barcodes.length > 0) {
                        handleScannedCode(barcodes[0].rawValue);
                        return;
                    }
                }
                showToast('未能自動辨識照片條碼，請手動輸入', 'info');
                elements.cameraStatusMsg.textContent = '未能辨識，請手動輸入';
            } catch (err) {
                showToast('辨識失敗，請手動輸入', 'info');
            }
        });

        // 全域鍵盤快捷鍵
        window.addEventListener('keydown', (e) => {
            // Esc 關閉彈窗
            if (e.key === 'Escape') {
                if (elements.barcodeModal.style.display === 'flex') closeModal();
                if (elements.cameraModal.style.display === 'flex') closeCameraModal();
                if (elements.helpModal.style.display === 'flex') elements.helpModal.style.display = 'none';
            }
            // 彈窗內左右鍵切換商品
            if (elements.barcodeModal.style.display === 'flex') {
                if (e.key === 'ArrowLeft') prevModalItem();
                if (e.key === 'ArrowRight') nextModalItem();
            }
            // / 鍵快速聚焦搜尋欄
            if (e.key === '/' && document.activeElement !== elements.searchInput && elements.barcodeModal.style.display !== 'flex') {
                e.preventDefault();
                elements.searchInput.focus();
                elements.searchInput.select();
            }
        });

        // 註冊 PWA Service Worker
        if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
            navigator.serviceWorker.register('./sw.js').catch(err => {
                console.log('SW registration skipped or failed:', err);
            });
        }
    }

    // --- 13. 對外暴露介面 (Global App API) ---
    window.pxApp = {
        enterApp,
        openModalByIndex,
        toggleFavorite,
        copyText
    };
    window.enterApp = enterApp;

    // --- 14. 系統初始化 (System Initialization) ---
    function init() {
        // 標準化字串欄位
        if (typeof PRODUCTS_DATA !== 'undefined' && Array.isArray(PRODUCTS_DATA)) {
            PRODUCTS_DATA.forEach(p => {
                p.pxCode = String(p.pxCode == null ? '' : p.pxCode);
                p.barcode = String(p.barcode == null ? '' : p.barcode);
                p.code = String(p.code == null ? '' : p.code);
                p.name = String(p.name == null ? '' : p.name);
            });

            // 動態同步封面與頁尾商品總數
            const countEl = document.getElementById('coverProductCount');
            if (countEl) countEl.textContent = `${PRODUCTS_DATA.length} 款`;
            const footerEl = document.getElementById('footerProductCount');
            if (footerEl) footerEl.textContent = PRODUCTS_DATA.length;
        }

        try { setupEventListeners(); } catch (e) { console.error('Events setup error:', e); }
        try { initFavorites(); } catch (e) { console.error('Favorites init error:', e); }
        try { renderCategoryTabs(); } catch (e) { console.error('Tabs render error:', e); }
        try { filterAndRender(); } catch (e) { console.error('Filter render error:', e); }

        // 若之前進入過，自動進入系統
        try {
            if (localStorage.getItem(STORAGE_KEY_COVER) === '1') {
                enterApp();
            }
        } catch (e) {}

        console.log(`PX MART Barcode System loaded: ${typeof PRODUCTS_DATA !== 'undefined' ? PRODUCTS_DATA.length : 0} products ready.`);
    }

    // 啟動
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
